// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge has direct unit tests.
import { PlaybackStoreContext } from "@fiftyone/playback/runtime";
import React, {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import type { EpisodeSession } from "../../../../ports/index";
import { VISUALIZATION_KIND } from "../../../../visualization/index";
import { shouldDeferBulkHistory } from "../../playback/bulk-stream-lifecycle";
import {
  useDemandDrivenHistory,
  type DemandDrivenHistoryLoader,
} from "../../playback/use-demand-driven-history";
import { useFrameTransformsContext } from "../../spatial/frame-transforms/context";
import {
  decimateTrajectory,
  type PoseTrajectoryPoint,
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
export interface PoseTrajectoryState {
  readonly points: readonly PoseTrajectoryPoint[];
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
export type PoseTrajectories = ReadonlyMap<string, PoseTrajectoryState>;

const EMPTY_TRAJECTORIES: PoseTrajectories = new Map();

interface PoseTrajectoriesContextValue {
  readonly setTrajectories: (state: PoseTrajectories) => void;
  readonly trajectories: PoseTrajectories;
}

const PoseTrajectoriesContext =
  createContext<PoseTrajectoriesContextValue | null>(null);

/**
 * Shares fetched pose trajectories with tile bodies. The provider lives
 * outside the playback shell; `PoseTrajectoriesBridge` inside the
 * shell owns the fetches and publishes results here, so trajectories are
 * fetched once per file regardless of how many 3D tiles consume them.
 */
export const PoseTrajectoriesProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [trajectories, setTrajectories] =
    useState<PoseTrajectories>(EMPTY_TRAJECTORIES);
  const value = useMemo(
    () => ({ setTrajectories, trajectories }),
    [trajectories],
  );

  return (
    <PoseTrajectoriesContext.Provider value={value}>
      {children}
    </PoseTrajectoriesContext.Provider>
  );
};

/**
 * Reads the fetched pose trajectories (empty outside the provider's
 * bridge lifecycle).
 */
export function usePoseTrajectoriesContext(): PoseTrajectories {
  return useContextValue().trajectories;
}

/**
 * Holds pose-history reads until transform placement has settled, so the
 * first meaningful 3D render never waits behind full-file context reads.
 */
export function PoseTrajectoriesStartupGate({
  poseStreams,
  session,
  sourceKey,
}: {
  readonly poseStreams: readonly string[];
  readonly session: EpisodeSession | null;
  readonly sourceKey: string | null;
}) {
  const { status } = useFrameTransformsContext();
  // Trajectories wait for placement to SETTLE, not to succeed: a transform
  // bootstrap error already degrades placement everywhere, and keeping the
  // gate shut on it would silently drop trajectories too (unframed pose
  // streams can still render without any transforms).
  const enabled = status === "ready" || status === "error";
  return (
    <PoseTrajectoriesBridge
      enabled={enabled}
      poseStreams={poseStreams}
      session={session}
      sourceKey={sourceKey}
    />
  );
}

/**
 * Loads selected pose histories after first 3D placement is viable.
 * Full-history reads use the bulk lane and completed trajectories remain warm
 * briefly when their final consumer closes.
 */
export function PoseTrajectoriesBridge({
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
  const { setTrajectories, trajectories: publishedTrajectories } =
    useContextValue();
  // Nullable on purpose: callers inside the playback shell provide the store
  // (enabling the network-health gate); standalone callers and tests get
  // null and keep ungated behavior.
  const playbackStore = useContext(PlaybackStoreContext);

  const loadStream = useCallback(
    async ({
      commit,
      control,
      stream,
    }: DemandDrivenHistoryLoader<PoseTrajectoryState>) => {
      if (!session) return;
      commit({ points: [], status: "loading" });

      const points: PoseTrajectoryPoint[] = [];
      let streamFrameId: string | undefined;
      try {
        for await (const batch of session.read({
          limit: TRAJECTORY_READ_LIMIT,
          priority: "bulk",
          signal: control.signal,
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
        commit({
          points: decimateTrajectory(points),
          status: "ready",
          ...(streamFrameId ? { streamFrameId } : {}),
        });
      } catch {
        if (control.isCancelled()) return;
        commit({ points: [], status: "error" });
      }
    },
    [session],
  );
  const trajectories = useDemandDrivenHistory({
    enabled,
    initialDelayMs: TRAJECTORY_START_DELAY_MS,
    isRetainable: isCompletedPoseTrajectory,
    loadStream,
    readIdentity: session,
    retryDelayMs: TRAJECTORY_DEFERRED_RETRY_MS,
    shouldStandDown: () => shouldDeferBulkHistory(playbackStore),
    sourceKey,
    streams: poseStreams,
  });

  // This effect publishes the source-scoped cache to mounted 3D tiles.
  useLayoutEffect(() => {
    if (
      publishedTrajectories === trajectories ||
      (publishedTrajectories.size === 0 && trajectories.size === 0)
    ) {
      return;
    }
    setTrajectories(trajectories);
  }, [publishedTrajectories, setTrajectories, trajectories]);

  // This effect clears published trajectories when the bridge unmounts.
  useEffect(
    () => () => {
      setTrajectories(EMPTY_TRAJECTORIES);
    },
    [setTrajectories],
  );

  return null;
}

function isCompletedPoseTrajectory(trajectory: PoseTrajectoryState): boolean {
  return trajectory.status === "ready";
}

function useContextValue(): PoseTrajectoriesContextValue {
  const value = useContext(PoseTrajectoriesContext);
  if (!value) {
    throw new Error(
      "episode pose trajectories must be used inside <PoseTrajectoriesProvider>",
    );
  }

  return value;
}
