// Deep import on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge has direct unit tests.
import { PlaybackStoreContext } from "@fiftyone/playback/src/lib/playback/playback-store-context";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import { byteSourceAccessKey } from "../../../query/bytes";
import { VISUALIZATION_KIND } from "../../../visualization";
import { MCAP_ACTIVE_TIMELINE, type McapResourceClient } from "../types";
import { useMcapFrameTransformsContext } from "./mcap-frame-transforms-context";
import { shouldDeferMcapIdleWorkForStore } from "./mcap-network-health";
import {
  decimateTrajectory,
  type McapPoseTrajectoryPoint,
} from "./pose-trajectory";

// Hard cap on one topic's history read: a runaway high-rate stream stops
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
 * One pose topic's fetched trajectory history.
 */
export interface McapPoseTrajectoryState {
  readonly points: readonly McapPoseTrajectoryPoint[];
  readonly status: "loading" | "ready" | "error";
  /**
   * Frame id declared by the stream's own messages, when any message
   * carried one. Frameless streams (JSON odometry) leave this unset and
   * consumers choose a frame.
   */
  readonly streamFrameId?: string;
}

/**
 * Fetched trajectories by pose topic.
 */
export type McapPoseTrajectories = ReadonlyMap<string, McapPoseTrajectoryState>;

const EMPTY_TRAJECTORIES: McapPoseTrajectories = new Map();

interface McapPoseTrajectoriesContextValue {
  readonly setTrajectories: (state: McapPoseTrajectories) => void;
  readonly trajectories: McapPoseTrajectories;
}

const McapPoseTrajectoriesContext =
  createContext<McapPoseTrajectoriesContextValue | null>(null);

/**
 * Shares fetched pose trajectories with tile bodies. The provider lives
 * outside the playback shell; `McapPoseTrajectoriesBridge` inside the
 * shell owns the fetches and publishes results here, so trajectories are
 * fetched once per file regardless of how many 3D tiles consume them.
 */
export const McapPoseTrajectoriesProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [trajectories, setTrajectories] =
    useState<McapPoseTrajectories>(EMPTY_TRAJECTORIES);
  const value = useMemo(
    () => ({ setTrajectories, trajectories }),
    [trajectories],
  );

  return (
    <McapPoseTrajectoriesContext.Provider value={value}>
      {children}
    </McapPoseTrajectoriesContext.Provider>
  );
};

/**
 * Reads the fetched pose trajectories (empty outside the provider's
 * bridge lifecycle).
 */
export function useMcapPoseTrajectoriesContext(): McapPoseTrajectories {
  return useContextValue().trajectories;
}

/**
 * Holds pose-history reads until transform placement has settled, so the
 * first meaningful 3D render never waits behind full-file context reads.
 */
export function McapPoseTrajectoriesStartupGate({
  client,
  poseTopics,
  source,
}: {
  readonly client: McapResourceClient;
  readonly poseTopics: readonly string[];
  readonly source: ByteSourceDescriptor | null;
}) {
  const { status } = useMcapFrameTransformsContext();
  // Trajectories wait for placement to SETTLE, not to succeed: a transform
  // bootstrap error already degrades placement everywhere, and keeping the
  // gate shut on it would silently drop trajectories too (unframed pose
  // streams can still render without any transforms).
  const enabled = status === "ready" || status === "error";
  return (
    <McapPoseTrajectoriesBridge
      client={client}
      enabled={enabled}
      poseTopics={poseTopics}
      source={source}
    />
  );
}

/**
 * Bridge that fetches each pose topic's full history once per source after
 * first 3D placement is viable. Full-history reads use the bulk lane so they
 * never serialize playback lookahead or transform placement work. Tile
 * selection changes never refetch — the cache is immutable per-topic file
 * data; consumers filter what renders.
 */
export function McapPoseTrajectoriesBridge({
  client,
  enabled = true,
  poseTopics,
  source,
}: {
  readonly client: McapResourceClient;
  readonly enabled?: boolean;
  readonly poseTopics: readonly string[];
  readonly source: ByteSourceDescriptor | null;
}) {
  const { setTrajectories } = useContextValue();
  const sourceKey = source ? byteSourceAccessKey(source) : null;
  const fetchedTopicsRef = useRef(new Set<string>());
  const trajectoriesRef = useRef(new Map<string, McapPoseTrajectoryState>());
  // Nullable on purpose: callers inside the playback shell provide the store
  // (enabling the network-health gate); standalone callers and tests get
  // null and keep ungated behavior.
  const playbackStore = useContext(PlaybackStoreContext);

  // This effect fetches newly appearing pose topics once per source and
  // drops state for topics that leave the inventory. It re-keys (full
  // reset) when the source changes.
  useEffect(() => {
    fetchedTopicsRef.current = new Set();
    trajectoriesRef.current = new Map();
    setTrajectories(EMPTY_TRAJECTORIES);

    if (!enabled || !sourceKey || !source) {
      return undefined;
    }

    let cancelled = false;
    let startTimeout: ReturnType<typeof setTimeout> | null = null;
    const commit = (topic: string, state: McapPoseTrajectoryState) => {
      if (cancelled) {
        return;
      }
      trajectoriesRef.current.set(topic, state);
      setTrajectories(new Map(trajectoriesRef.current));
    };

    const start = () => {
      if (cancelled) {
        return;
      }
      // A near-full-file scan on a starved link would fight foreground
      // catch-up for bandwidth (lanes are separate workers, not separate
      // links). While the user is actively waiting on a limited network,
      // stand down and re-check.
      if (
        playbackStore &&
        shouldDeferMcapIdleWorkForStore(playbackStore, null)
      ) {
        startTimeout = setTimeout(start, TRAJECTORY_DEFERRED_RETRY_MS);
        return;
      }

      for (const topic of poseTopics) {
        if (fetchedTopicsRef.current.has(topic)) {
          continue;
        }
        fetchedTopicsRef.current.add(topic);
        commit(topic, { points: [], status: "loading" });

        void (async () => {
          const points: McapPoseTrajectoryPoint[] = [];
          let streamFrameId: string | undefined;
          try {
            for await (const message of client.readDecodedMessages(
              {
                activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
                limit: TRAJECTORY_READ_LIMIT,
                source,
                topics: [topic],
              },
              { priority: "bulk" },
            )) {
              if (cancelled) {
                return;
              }
              const visualization = message.decoded.output.visualization;
              if (visualization?.kind !== VISUALIZATION_KIND.POSE) {
                continue;
              }
              if (!streamFrameId && visualization.coordinateFrameId) {
                streamFrameId = visualization.coordinateFrameId;
              }
              points.push({
                position: visualization.position,
                timeNs: message.timelineTimeNs,
              });
            }

            commit(topic, {
              points: decimateTrajectory(points),
              status: "ready",
              ...(streamFrameId ? { streamFrameId } : {}),
            });
          } catch {
            commit(topic, { points: [], status: "error" });
          }
        })();
      }
    };

    startTimeout = setTimeout(start, TRAJECTORY_START_DELAY_MS);

    return () => {
      cancelled = true;
      if (startTimeout !== null) {
        clearTimeout(startTimeout);
      }
    };
    // `poseTopics` identity is derived from the scene inventory, so this
    // covers both source swaps and topics appearing late.
  }, [
    client,
    enabled,
    playbackStore,
    poseTopics,
    setTrajectories,
    source,
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

function useContextValue(): McapPoseTrajectoriesContextValue {
  const value = useContext(McapPoseTrajectoriesContext);
  if (!value) {
    throw new Error(
      "MCAP pose trajectories must be used inside <McapPoseTrajectoriesProvider>",
    );
  }

  return value;
}
