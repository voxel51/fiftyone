// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge has direct unit tests.
import { PlaybackStoreContext } from "@fiftyone/playback/runtime";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { EpisodeSession } from "../../../../ports/index";
import { VISUALIZATION_KIND } from "../../../../visualization/index";
import {
  shouldDeferEpisodeBulkHistory,
  startEpisodeBulkStreamLifecycle,
} from "../../playback/episode-bulk-stream-lifecycle";
import { useEpisodeFrameTransformsContext } from "../../spatial/frame-transforms/context";
import {
  decimateTrajectory,
  type EpisodePoseTrajectoryPoint,
} from "./pose-trajectory";

// Hard cap on one stream's history read: a runaway high-rate stream stops
// here instead of exhausting memory (~50Hz over 8 minutes).
const TRAJECTORY_READ_LIMIT = 25_000;
// Full-history reads run on their own worker but share the physical link
// with first-paint fetches: hold them until the initial image/point-cloud
// burst has cleared the network.
const TRAJECTORY_START_DELAY_MS = 1_500;
// While the transport is network-limited and the user is actively waiting,
// re-check instead of launching a near-full-file scan into a starved link.
const TRAJECTORY_DEFERRED_RETRY_MS = 2_000;

/**
 * One pose stream's fetched trajectory history.
 */
export interface EpisodePoseTrajectoryState {
  readonly points: readonly EpisodePoseTrajectoryPoint[];
  readonly status: "loading" | "ready" | "error";
  /**
   * Frame id declared by the stream's own messages, when any message
   * carried one. Frameless streams (JSON odometry) leave this unset and
   * consumers choose a frame.
   */
  readonly streamFrameId?: string;
}

/**
 * Fetched trajectories by pose stream.
 */
export type EpisodePoseTrajectories = ReadonlyMap<
  string,
  EpisodePoseTrajectoryState
>;

const EMPTY_TRAJECTORIES: EpisodePoseTrajectories = new Map();

interface EpisodePoseTrajectoriesContextValue {
  readonly setTrajectories: (state: EpisodePoseTrajectories) => void;
  readonly trajectories: EpisodePoseTrajectories;
}

const EpisodePoseTrajectoriesContext =
  createContext<EpisodePoseTrajectoriesContextValue | null>(null);

/**
 * Shares fetched pose trajectories with tile bodies. The provider lives
 * outside the playback shell; `EpisodePoseTrajectoriesBridge` inside the
 * shell owns the fetches and publishes results here, so trajectories are
 * fetched once per file regardless of how many 3D tiles consume them.
 */
export const EpisodePoseTrajectoriesProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [trajectories, setTrajectories] =
    useState<EpisodePoseTrajectories>(EMPTY_TRAJECTORIES);
  const value = useMemo(
    () => ({ setTrajectories, trajectories }),
    [trajectories],
  );

  return (
    <EpisodePoseTrajectoriesContext.Provider value={value}>
      {children}
    </EpisodePoseTrajectoriesContext.Provider>
  );
};

/**
 * Reads the fetched pose trajectories (empty outside the provider's
 * bridge lifecycle).
 */
export function useEpisodePoseTrajectoriesContext(): EpisodePoseTrajectories {
  return useContextValue().trajectories;
}

/**
 * Holds pose-history reads until transform placement has settled, so the
 * first meaningful 3D render never waits behind full-file context reads.
 */
export function EpisodePoseTrajectoriesStartupGate({
  poseStreams,
  session,
  sourceKey,
}: {
  readonly poseStreams: readonly string[];
  readonly session: EpisodeSession | null;
  readonly sourceKey: string | null;
}) {
  const { status } = useEpisodeFrameTransformsContext();
  // Trajectories wait for placement to SETTLE, not to succeed: a transform
  // bootstrap error already degrades placement everywhere, and keeping the
  // gate shut on it would silently drop trajectories too (unframed pose
  // streams can still render without any transforms).
  const enabled = status === "ready" || status === "error";
  return (
    <EpisodePoseTrajectoriesBridge
      enabled={enabled}
      poseStreams={poseStreams}
      session={session}
      sourceKey={sourceKey}
    />
  );
}

/**
 * Bridge that fetches each pose stream's full history once per source after
 * first 3D placement is viable. Full-history reads use the bulk lane so they
 * never serialize playback lookahead or transform placement work. Tile
 * selection changes never refetch — the cache is immutable per-stream file
 * data; consumers filter what renders.
 */
export function EpisodePoseTrajectoriesBridge({
  enabled = true,
  poseStreams,
  session,
  sourceKey,
}: {
  readonly enabled?: boolean;
  readonly poseStreams: readonly string[];
  readonly session: EpisodeSession | null;
  readonly sourceKey: string | null;
}) {
  const { setTrajectories } = useContextValue();
  const trajectoriesRef = useRef(new Map<string, EpisodePoseTrajectoryState>());
  // Nullable on purpose: callers inside the playback shell provide the store
  // (enabling the network-health gate); standalone callers and tests get
  // null and keep ungated behavior.
  const playbackStore = useContext(PlaybackStoreContext);

  // This effect fetches newly appearing pose streams once per source and
  // drops state for streams that leave the inventory. It re-keys (full
  // reset) when the source changes.
  useEffect(() => {
    trajectoriesRef.current = new Map();
    setTrajectories(EMPTY_TRAJECTORIES);

    if (!enabled || !sourceKey || !session) {
      return undefined;
    }

    const commit = (stream: string, state: EpisodePoseTrajectoryState) => {
      trajectoriesRef.current.set(stream, state);
      setTrajectories(new Map(trajectoriesRef.current));
    };

    return startEpisodeBulkStreamLifecycle({
      initialDelayMs: TRAJECTORY_START_DELAY_MS,
      retryDelayMs: TRAJECTORY_DEFERRED_RETRY_MS,
      shouldStandDown: () => shouldDeferEpisodeBulkHistory(playbackStore),
      streams: poseStreams,
      runStream: async (stream, control) => {
        commit(stream, { points: [], status: "loading" });

        const points: EpisodePoseTrajectoryPoint[] = [];
        let streamFrameId: string | undefined;
        try {
          for await (const batch of session.read({
            limit: TRAJECTORY_READ_LIMIT,
            priority: "bulk",
            streams: [stream],
            window: session.manifest.timeRange,
          })) {
            for (const frame of batch.frames) {
              if (control.isCancelled() || control.standDown()) return;
              const visualization = frame.output.visualization;
              if (visualization?.kind !== VISUALIZATION_KIND.POSE) continue;
              if (!streamFrameId && visualization.coordinateFrameId) {
                streamFrameId = visualization.coordinateFrameId;
              }
              points.push({
                position: visualization.position,
                timeNs: frame.timestampNs,
              });
            }
          }

          if (control.isCancelled()) return;
          commit(stream, {
            points: decimateTrajectory(points),
            status: "ready",
            ...(streamFrameId ? { streamFrameId } : {}),
          });
        } catch {
          if (control.isCancelled()) return;
          commit(stream, { points: [], status: "error" });
        }
      },
    });
    // `poseStreams` identity is derived from the scene inventory, so this
    // covers both source swaps and streams appearing late.
  }, [
    enabled,
    playbackStore,
    poseStreams,
    setTrajectories,
    session,
    sourceKey,
  ]);

  // This effect clears published trajectories when the bridge unmounts.
  useEffect(
    () => () => {
      setTrajectories(EMPTY_TRAJECTORIES);
    },
    [setTrajectories],
  );

  return null;
}

function useContextValue(): EpisodePoseTrajectoriesContextValue {
  const value = useContext(EpisodePoseTrajectoriesContext);
  if (!value) {
    throw new Error(
      "episode pose trajectories must be used inside <EpisodePoseTrajectoriesProvider>",
    );
  }

  return value;
}
