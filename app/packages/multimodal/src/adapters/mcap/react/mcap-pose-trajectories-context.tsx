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
import {
  decimateTrajectory,
  type McapPoseTrajectoryPoint,
} from "./pose-trajectory";

// Hard cap on one topic's history read: a runaway high-rate stream stops
// here instead of exhausting memory (~50Hz over 8 minutes).
const TRAJECTORY_READ_LIMIT = 25_000;
const TRAJECTORY_START_DELAY_MS = 1_500;

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
    const commit = (topic: string, state: McapPoseTrajectoryState) => {
      if (cancelled) {
        return;
      }
      trajectoriesRef.current.set(topic, state);
      setTrajectories(new Map(trajectoriesRef.current));
    };

    const startTimeout = setTimeout(() => {
      if (cancelled) {
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
    }, TRAJECTORY_START_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(startTimeout);
    };
    // `poseTopics` identity is derived from the scene inventory, so this
    // covers both source swaps and topics appearing late.
  }, [client, enabled, poseTopics, setTrajectories, source, sourceKey]);

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
