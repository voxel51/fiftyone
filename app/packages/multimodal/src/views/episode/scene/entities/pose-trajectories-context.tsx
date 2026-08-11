// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge has direct unit tests.
import { getPlayhead, PlaybackStoreContext } from "@fiftyone/playback/runtime";
import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  EpisodeSession,
  FrameBatch,
  SourceReadBudgetAccount,
} from "../../../../ports/index";
import { VISUALIZATION_KIND } from "../../../../visualization/index";
import { shouldDeferBulkHistory } from "../../playback/bulk-stream-lifecycle";
import { useDataStream } from "../../playback/data-stream-context";
import { useProgressiveHistory } from "../../playback/use-progressive-history";
import { useFrameTransformsContext } from "../../spatial/frame-transforms/context";
import {
  decimateTrajectory,
  type PoseTrajectoryPoint,
} from "./pose-trajectory";

// Hard cap on one stream's history read: a runaway high-rate stream stops
// here instead of exhausting memory (~50Hz over 8 minutes).
const TRAJECTORY_FALLBACK_TILE_READ_LIMIT = 25_000;
const TRAJECTORY_HISTORY_ITEM_LIMIT = 250_000;
const TRAJECTORY_FALLBACK_TILE_NS = 10_000_000_000n;
const TRAJECTORY_GRANT_BUDGET = {
  maxMessages: 10_000,
  maxSourceBytes: 32 * 1024 * 1024,
  maxUncompressedBytes: 64 * 1024 * 1024,
  maxWallTimeMs: 750,
} as const;
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
  readonly status: "loading" | "ready" | "truncated" | "error";
  readonly truncated?: boolean;
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
  budgetAccount,
  poseStreams,
  session,
  sourceKey,
}: {
  readonly budgetAccount?: SourceReadBudgetAccount | null;
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
      budgetAccount={budgetAccount}
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
  budgetAccount,
  enabled = true,
  poseStreams,
  session,
  sourceKey,
}: {
  readonly budgetAccount?: SourceReadBudgetAccount | null;
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
  const dataStream = useDataStream();
  const streamsKey = [...new Set(poseStreams)].sort().join("\0");
  const normalizedStreams = useMemo(
    () => (streamsKey ? streamsKey.split("\0") : []),
    [streamsKey],
  );
  // The playhead is sampled only when a new source/selection needs an anchor;
  // the retained traversal must not re-anchor or re-render on playback ticks.
  const playheadSec = playbackStore ? getPlayhead(playbackStore) : 0;
  const timeline = dataStream?.getTimelineIndex() ?? null;
  const preferredTimeNs = timeline?.secToNs(playheadSec);
  const preferredAnchorRef = useRef<{
    readonly session: EpisodeSession | null;
    readonly sourceKey: string | null;
    readonly streamsKey: string;
    readonly timeNs: bigint | undefined;
  }>();
  const anchorIdentityChanged =
    preferredAnchorRef.current?.session !== session ||
    preferredAnchorRef.current?.sourceKey !== sourceKey ||
    preferredAnchorRef.current?.streamsKey !== streamsKey;
  if (anchorIdentityChanged) {
    // Freeze one center-out traversal anchor for the retained job. Seeks do
    // not restart already-paid history work; a source or selection change does.
    preferredAnchorRef.current = {
      session,
      sourceKey,
      streamsKey,
      timeNs: preferredTimeNs ?? session?.manifest.timeRange.startNs,
    };
  }
  const preferredAnchorNs = preferredAnchorRef.current?.timeNs;
  const config = useMemo(
    () => ({
      accumulator: POSE_HISTORY_ACCUMULATOR,
      budget: TRAJECTORY_GRANT_BUDGET,
      fallback: {
        maxMessagesPerStream: TRAJECTORY_FALLBACK_TILE_READ_LIMIT,
        tileDurationNs: TRAJECTORY_FALLBACK_TILE_NS,
      },
      family: "pose" as const,
      key: streamsKey,
      maxItems: TRAJECTORY_HISTORY_ITEM_LIMIT,
      ...(preferredAnchorNs !== undefined
        ? { preferredTimeNs: preferredAnchorNs }
        : {}),
      priority: "bulk" as const,
      streams: normalizedStreams,
      traversal: "center-out" as const,
      window: session?.manifest.timeRange ?? { endNs: 0n, startNs: 0n },
    }),
    [
      normalizedStreams,
      preferredAnchorNs,
      session?.manifest.timeRange,
      streamsKey,
    ],
  );
  const progress = useProgressiveHistory({
    account: budgetAccount,
    config,
    enabled: enabled && normalizedStreams.length > 0,
    initialDelayMs: TRAJECTORY_START_DELAY_MS,
    retryDelayMs: TRAJECTORY_DEFERRED_RETRY_MS,
    session,
    shouldStandDown: () => shouldDeferBulkHistory(playbackStore),
  });
  const renderedPointsCacheRef = useRef<Map<
    string,
    {
      readonly points: readonly PoseTrajectoryPoint[];
      readonly source: readonly PoseTrajectoryPoint[];
    }
  > | null>(null);
  if (!renderedPointsCacheRef.current) {
    renderedPointsCacheRef.current = new Map();
  }
  const renderedPointsCache = renderedPointsCacheRef.current;
  const trajectories = useMemo<PoseTrajectories>(() => {
    if (!sourceKey || normalizedStreams.length === 0) return EMPTY_TRAJECTORIES;
    const status =
      progress.status === "complete"
        ? "ready"
        : progress.status === "error"
          ? "error"
          : progress.status === "truncated"
            ? "truncated"
            : "loading";
    const activeStreams = new Set(normalizedStreams);
    for (const stream of renderedPointsCache.keys()) {
      if (!activeStreams.has(stream)) renderedPointsCache.delete(stream);
    }
    return new Map(
      normalizedStreams.map((stream) => {
        const rawPoints = progress.value.pointsByStream.get(stream) ?? [];
        const cached = renderedPointsCache.get(stream);
        const points =
          cached?.source === rawPoints
            ? cached.points
            : decimateTrajectory(
                [...rawPoints].sort((left, right) =>
                  left.timeNs < right.timeNs
                    ? -1
                    : left.timeNs > right.timeNs
                      ? 1
                      : 0,
                ),
              );
        if (cached?.source !== rawPoints) {
          renderedPointsCache.set(stream, {
            points,
            source: rawPoints,
          });
        }
        const streamFrameId = progress.value.frameByStream.get(stream);
        return [
          stream,
          {
            points,
            status,
            ...(progress.truncated ? { truncated: true } : {}),
            ...(streamFrameId ? { streamFrameId } : {}),
          } satisfies PoseTrajectoryState,
        ];
      }),
    );
  }, [normalizedStreams, progress, renderedPointsCache, sourceKey]);

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

interface PoseHistoryAccumulator {
  readonly frameByStream: ReadonlyMap<string, string>;
  readonly itemCount: number;
  readonly pointsByStream: ReadonlyMap<string, readonly PoseTrajectoryPoint[]>;
}

const EMPTY_POSE_HISTORY: PoseHistoryAccumulator = {
  frameByStream: new Map(),
  itemCount: 0,
  pointsByStream: new Map(),
};

const POSE_HISTORY_ACCUMULATOR = {
  initialValue: EMPTY_POSE_HISTORY,
  consume(
    current: PoseHistoryAccumulator,
    batches: readonly FrameBatch[],
  ): { readonly itemCount: number; readonly value: PoseHistoryAccumulator } {
    const frameByStream = new Map(current.frameByStream);
    const pointsByStream = new Map(current.pointsByStream);
    const copiedStreams = new Set<string>();
    let itemCount = current.itemCount;
    for (const batch of batches) {
      let points: PoseTrajectoryPoint[];
      if (copiedStreams.has(batch.stream)) {
        points = pointsByStream.get(batch.stream) as PoseTrajectoryPoint[];
      } else {
        points = [...(pointsByStream.get(batch.stream) ?? [])];
        copiedStreams.add(batch.stream);
        pointsByStream.set(batch.stream, points);
      }
      for (const frame of batch.frames) {
        const visualization = frame.output.visualization;
        if (visualization?.kind !== VISUALIZATION_KIND.POSE) continue;
        if (
          !frameByStream.has(batch.stream) &&
          visualization.coordinateFrameId
        ) {
          frameByStream.set(batch.stream, visualization.coordinateFrameId);
        }
        points.push({
          position: visualization.position,
          timeNs: frame.timestampNs,
        });
        itemCount += 1;
      }
    }
    return {
      itemCount,
      value: { frameByStream, itemCount, pointsByStream },
    };
  },
};

function useContextValue(): PoseTrajectoriesContextValue {
  const value = useContext(PoseTrajectoriesContext);
  if (!value) {
    throw new Error(
      "episode pose trajectories must be used inside <PoseTrajectoriesProvider>",
    );
  }

  return value;
}
