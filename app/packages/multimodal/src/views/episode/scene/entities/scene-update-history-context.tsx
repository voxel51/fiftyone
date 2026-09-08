import { PlaybackStoreContext } from "@fiftyone/playback/runtime";
import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import type {
  EpisodeSession,
  FrameBatch,
  SourceReadBudgetAccount,
} from "../../../../ports/index";
import { VISUALIZATION_KIND } from "../../../../visualization/index";
import { shouldDeferBulkHistory } from "../../playback/bulk-stream-lifecycle";
import { useProgressiveHistory } from "../../playback/use-progressive-history";
import type { SceneUpdateDelta } from "./scene-update-state";

const SCENE_UPDATE_FALLBACK_TILE_READ_LIMIT = 50_000;
// Scene deltas retain complete visualization payloads. This doubles the old
// one-shot ceiling while keeping the session-retained heap guard conservative.
const SCENE_UPDATE_HISTORY_ITEM_LIMIT = 100_000;
const SCENE_UPDATE_FALLBACK_TILE_NS = 5_000_000_000n;
const SCENE_UPDATE_GRANT_BUDGET = {
  maxMessages: 10_000,
  maxSourceBytes: 32 * 1024 * 1024,
  maxUncompressedBytes: 64 * 1024 * 1024,
  maxWallTimeMs: 750,
} as const;
const SCENE_UPDATE_HISTORY_START_DELAY_MS = 1_500;
const SCENE_UPDATE_HISTORY_DEFERRED_RETRY_MS = 2_000;

/** Progressive reconstruction state for one scene-update stream. */
export interface SceneUpdateHistoryStream {
  readonly deltas: readonly SceneUpdateDelta[];
  /** The chronological prefix is complete through this message timestamp. */
  readonly loadedThroughNs?: bigint;
  readonly status: "error" | "loading" | "ready" | "truncated";
  readonly truncated?: boolean;
}

/** Scene-update histories keyed by stream id. */
export type SceneUpdateHistory = ReadonlyMap<string, SceneUpdateHistoryStream>;

const EMPTY_HISTORY: SceneUpdateHistory = new Map();

interface SceneUpdateHistoryContextValue {
  readonly history: SceneUpdateHistory;
  readonly setHistory: (state: SceneUpdateHistory) => void;
}

const SceneUpdateHistoryContext =
  createContext<SceneUpdateHistoryContextValue | null>(null);

/**
 * Shares full-stream scene-update histories with 3D tiles. These histories are
 * needed for correctness on stateful streams such as ROS MarkerArray: the
 * latest delta at a seek target is not enough to reconstruct older persistent
 * marker ids.
 */
export const SceneUpdateHistoryProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [history, setHistory] = useState<SceneUpdateHistory>(EMPTY_HISTORY);
  const value = useMemo(() => ({ history, setHistory }), [history]);

  return (
    <SceneUpdateHistoryContext.Provider value={value}>
      {children}
    </SceneUpdateHistoryContext.Provider>
  );
};

/**
 * Reads scene-update history when available. This hook is intentionally
 * optional because interpolation also runs in lightweight consumers that use
 * the live stream cache without mounting the full playback history bridge.
 */
export function useSceneUpdateHistoryContext(): SceneUpdateHistory {
  return useContext(SceneUpdateHistoryContext)?.history ?? EMPTY_HISTORY;
}

/** Loads selected scene-update histories and publishes chronological prefixes. */
export function SceneUpdateHistoryBridge({
  budgetAccount,
  sceneAnnotationStreams,
  session,
  sourceKey,
}: {
  readonly budgetAccount?: SourceReadBudgetAccount | null;
  readonly sceneAnnotationStreams: readonly string[];
  readonly session: EpisodeSession | null;
  readonly sourceKey: string | null;
}) {
  const { history: publishedHistory, setHistory } = useContextValue();
  const playbackStore = useContext(PlaybackStoreContext);
  const streamsKey = [...new Set(sceneAnnotationStreams)].sort().join("\0");
  const normalizedStreams = useMemo(
    () => (streamsKey ? streamsKey.split("\0") : []),
    [streamsKey],
  );
  const timeRange = useMemo(
    () => session?.manifest.timeRange ?? { endNs: 0n, startNs: 0n },
    [session],
  );
  const config = useMemo(
    () => ({
      accumulator: SCENE_UPDATE_HISTORY_ACCUMULATOR,
      budget: SCENE_UPDATE_GRANT_BUDGET,
      fallback: {
        maxMessagesPerStream: SCENE_UPDATE_FALLBACK_TILE_READ_LIMIT,
        tileDurationNs: SCENE_UPDATE_FALLBACK_TILE_NS,
      },
      family: "scene-update" as const,
      key: streamsKey,
      maxItems: SCENE_UPDATE_HISTORY_ITEM_LIMIT,
      priority: "bulk" as const,
      streams: normalizedStreams,
      traversal: "chronological" as const,
      window: timeRange,
    }),
    [normalizedStreams, streamsKey, timeRange],
  );
  const progress = useProgressiveHistory({
    account: budgetAccount,
    config,
    enabled: normalizedStreams.length > 0,
    initialDelayMs: SCENE_UPDATE_HISTORY_START_DELAY_MS,
    retryDelayMs: SCENE_UPDATE_HISTORY_DEFERRED_RETRY_MS,
    session,
    shouldStandDown: () => shouldDeferBulkHistory(playbackStore),
  });
  const history = useMemo<SceneUpdateHistory>(() => {
    if (!sourceKey || normalizedStreams.length === 0) return EMPTY_HISTORY;
    return new Map(
      normalizedStreams.map((stream) => {
        const unavailable = progress.unavailableByStream.get(stream) ?? [];
        const loadedThroughNs = sceneUpdateLoadedThrough({
          coverage: progress.coverageByStream.get(stream) ?? [],
          nextUnreadNs: progress.nextUnreadNs,
          timeRange,
          unavailable,
        });
        const deltas = progress.value.deltasByStream.get(stream) ?? [];
        const status: SceneUpdateHistoryStream["status"] =
          progress.status === "complete"
            ? "ready"
            : progress.status === "error"
              ? "error"
              : progress.status === "truncated"
                ? "truncated"
                : "loading";
        return [
          stream,
          {
            deltas,
            ...(loadedThroughNs !== undefined ? { loadedThroughNs } : {}),
            status,
            ...(progress.truncated ? { truncated: true } : {}),
          } satisfies SceneUpdateHistoryStream,
        ];
      }),
    );
  }, [normalizedStreams, progress, sourceKey, timeRange]);

  // This effect publishes the source-scoped cache to mounted 3D tiles.
  useLayoutEffect(() => {
    if (
      publishedHistory === history ||
      (publishedHistory.size === 0 && history.size === 0)
    ) {
      return;
    }
    setHistory(history);
  }, [history, publishedHistory, setHistory]);

  // This effect clears shared history when the bridge leaves the provider.
  useEffect(
    () => () => {
      setHistory(EMPTY_HISTORY);
    },
    [setHistory],
  );

  return null;
}

interface SceneUpdateHistoryAccumulator {
  readonly deltasByStream: ReadonlyMap<string, readonly SceneUpdateDelta[]>;
  readonly itemCount: number;
}

const SCENE_UPDATE_HISTORY_ACCUMULATOR = {
  initialValue: {
    deltasByStream: new Map(),
    itemCount: 0,
  } satisfies SceneUpdateHistoryAccumulator,
  consume(
    current: SceneUpdateHistoryAccumulator,
    batches: readonly FrameBatch[],
  ): {
    readonly itemCount: number;
    readonly value: SceneUpdateHistoryAccumulator;
  } {
    const deltasByStream = new Map(current.deltasByStream);
    const copiedStreams = new Set<string>();
    let itemCount = current.itemCount;
    for (const batch of batches) {
      let deltas: SceneUpdateDelta[];
      if (copiedStreams.has(batch.stream)) {
        deltas = deltasByStream.get(batch.stream) as SceneUpdateDelta[];
      } else {
        deltas = [...(deltasByStream.get(batch.stream) ?? [])];
        copiedStreams.add(batch.stream);
        deltasByStream.set(batch.stream, deltas);
      }
      for (const frame of batch.frames) {
        const visualization = frame.output.visualization;
        if (visualization?.kind !== VISUALIZATION_KIND.SCENE_UPDATE) continue;
        deltas.push({ timeNs: frame.timestampNs, update: visualization });
        itemCount += 1;
      }
    }
    return { itemCount, value: { deltasByStream, itemCount } };
  },
};

function sceneUpdateLoadedThrough({
  coverage,
  nextUnreadNs,
  timeRange,
  unavailable,
}: {
  readonly coverage: readonly {
    readonly endNs: bigint;
    readonly startNs: bigint;
  }[];
  readonly nextUnreadNs: bigint | undefined;
  readonly timeRange: { readonly endNs: bigint; readonly startNs: bigint };
  readonly unavailable: readonly {
    readonly endNs: bigint;
    readonly startNs: bigint;
  }[];
}): bigint | undefined {
  let loadedThroughNs =
    nextUnreadNs !== undefined && nextUnreadNs > timeRange.startNs
      ? nextUnreadNs - 1n
      : undefined;
  let cursor = timeRange.startNs;
  // Progressive history normalizes coverage into sorted, merged ranges, so
  // this walk proves only the contiguous prefix from the manifest start.
  for (const range of coverage) {
    if (range.startNs > cursor) break;
    if (range.endNs >= cursor) cursor = range.endNs + 1n;
  }
  if (cursor > timeRange.startNs) {
    const coveredThroughNs = cursor - 1n;
    loadedThroughNs =
      loadedThroughNs === undefined || coveredThroughNs > loadedThroughNs
        ? coveredThroughNs
        : loadedThroughNs;
  }
  if (loadedThroughNs === undefined) return undefined;
  const provenThroughNs = loadedThroughNs;
  const firstUnavailable = unavailable
    .filter((range) => range.startNs <= provenThroughNs)
    .sort((left, right) =>
      left.startNs < right.startNs ? -1 : left.startNs > right.startNs ? 1 : 0,
    )[0];
  if (firstUnavailable) {
    const cappedNs = firstUnavailable.startNs - 1n;
    if (cappedNs < timeRange.startNs) return undefined;
    return cappedNs < provenThroughNs ? cappedNs : provenThroughNs;
  }
  return provenThroughNs;
}

function useContextValue(): SceneUpdateHistoryContextValue {
  const value = useContext(SceneUpdateHistoryContext);
  if (!value) {
    throw new Error(
      "episode scene update history must be used inside <SceneUpdateHistoryProvider>",
    );
  }
  return value;
}
