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
import type { SceneUpdateDelta } from "./scene-update-state";

const SCENE_UPDATE_HISTORY_READ_LIMIT = 50_000;
/** Messages consumed per stream between progressive immutable snapshots. */
const SCENE_UPDATE_HISTORY_PROGRESS_BATCH_MESSAGES = 250;
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
  sceneAnnotationStreams,
  session,
  sourceKey,
}: {
  readonly sceneAnnotationStreams: readonly string[];
  readonly session: EpisodeSession | null;
  readonly sourceKey: string | null;
}) {
  const { history: publishedHistory, setHistory } = useContextValue();
  const playbackStore = useContext(PlaybackStoreContext);
  const loadStream = useCallback(
    async ({
      commit,
      control,
      stream,
    }: DemandDrivenHistoryLoader<SceneUpdateHistoryStream>) => {
      if (!session) return;
      commit({ deltas: [], status: "loading" });

      const deltas: SceneUpdateDelta[] = [];
      let loadedThroughNs: bigint | undefined;
      let messageCount = 0;
      let lastPublishedMessageCount = 0;
      try {
        for await (const batch of session.read({
          limit: SCENE_UPDATE_HISTORY_READ_LIMIT,
          priority: "bulk",
          signal: control.signal,
          streams: [stream],
          window: session.manifest.timeRange,
        })) {
          for (const frame of batch.frames) {
            if (control.isCancelled() || control.standDown()) return;
            messageCount += 1;
            if (
              loadedThroughNs === undefined ||
              frame.timestampNs > loadedThroughNs
            ) {
              loadedThroughNs = frame.timestampNs;
            }
            const visualization = frame.output.visualization;
            if (visualization?.kind !== VISUALIZATION_KIND.SCENE_UPDATE) {
              continue;
            }
            deltas.push({
              timeNs: frame.timestampNs,
              update: visualization,
            });
          }
          if (
            loadedThroughNs !== undefined &&
            (lastPublishedMessageCount === 0 ||
              messageCount - lastPublishedMessageCount >=
                SCENE_UPDATE_HISTORY_PROGRESS_BATCH_MESSAGES)
          ) {
            lastPublishedMessageCount = messageCount;
            commit({
              deltas: [...deltas],
              loadedThroughNs,
              status: "loading",
            });
          }
        }

        const truncated = messageCount >= SCENE_UPDATE_HISTORY_READ_LIMIT;
        if (control.isCancelled()) return;
        commit({
          deltas,
          ...(loadedThroughNs !== undefined ? { loadedThroughNs } : {}),
          status: truncated ? "truncated" : "ready",
          ...(truncated ? { truncated: true } : {}),
        });
      } catch {
        if (control.isCancelled()) return;
        commit({ deltas: [], status: "error" });
      }
    },
    [session],
  );
  const history = useDemandDrivenHistory({
    initialDelayMs: SCENE_UPDATE_HISTORY_START_DELAY_MS,
    isRetainable: isCompletedSceneUpdateHistory,
    loadStream,
    readIdentity: session,
    retryDelayMs: SCENE_UPDATE_HISTORY_DEFERRED_RETRY_MS,
    shouldStandDown: () => shouldDeferBulkHistory(playbackStore),
    sourceKey,
    streams: sceneAnnotationStreams,
  });

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

function isCompletedSceneUpdateHistory(
  history: SceneUpdateHistoryStream,
): boolean {
  return history.status === "ready" || history.status === "truncated";
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
