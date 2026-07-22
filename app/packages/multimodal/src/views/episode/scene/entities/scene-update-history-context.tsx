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
  shouldDeferBulkHistory,
  startBulkStreamLifecycle,
} from "../../playback/bulk-stream-lifecycle";
import type { SceneUpdateDelta } from "./scene-update-state";

const SCENE_UPDATE_HISTORY_READ_LIMIT = 50_000;
const SCENE_UPDATE_HISTORY_START_DELAY_MS = 1_500;
const SCENE_UPDATE_HISTORY_DEFERRED_RETRY_MS = 2_000;

export interface SceneUpdateHistoryStream {
  readonly deltas: readonly SceneUpdateDelta[];
  readonly status: "error" | "loading" | "ready" | "truncated";
  readonly truncated?: boolean;
}

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

export function SceneUpdateHistoryBridge({
  sceneAnnotationStreams,
  session,
  sourceKey,
}: {
  readonly sceneAnnotationStreams: readonly string[];
  readonly session: EpisodeSession | null;
  readonly sourceKey: string | null;
}) {
  const { setHistory } = useContextValue();
  const historyRef = useRef(new Map<string, SceneUpdateHistoryStream>());
  const playbackStore = useContext(PlaybackStoreContext);

  // This effect restarts bulk history collection when the source, session, or
  // selected annotation streams change.
  useEffect(() => {
    historyRef.current = new Map();
    setHistory(EMPTY_HISTORY);

    if (!sourceKey || !session || sceneAnnotationStreams.length === 0) {
      return undefined;
    }

    const commit = (stream: string, state: SceneUpdateHistoryStream) => {
      historyRef.current.set(stream, state);
      setHistory(new Map(historyRef.current));
    };

    return startBulkStreamLifecycle({
      initialDelayMs: SCENE_UPDATE_HISTORY_START_DELAY_MS,
      retryDelayMs: SCENE_UPDATE_HISTORY_DEFERRED_RETRY_MS,
      shouldStandDown: () => shouldDeferBulkHistory(playbackStore),
      streams: sceneAnnotationStreams,
      runStream: async (stream, control) => {
        commit(stream, { deltas: [], status: "loading" });

        const deltas: SceneUpdateDelta[] = [];
        let messageCount = 0;
        try {
          for await (const batch of session.read({
            limit: SCENE_UPDATE_HISTORY_READ_LIMIT,
            priority: "bulk",
            streams: [stream],
            window: session.manifest.timeRange,
          })) {
            for (const frame of batch.frames) {
              if (control.isCancelled() || control.standDown()) return;
              messageCount += 1;
              const visualization = frame.output.visualization;
              if (visualization?.kind !== VISUALIZATION_KIND.SCENE_UPDATE) {
                continue;
              }
              deltas.push({
                timeNs: frame.timestampNs,
                update: visualization,
              });
            }
          }

          const truncated = messageCount >= SCENE_UPDATE_HISTORY_READ_LIMIT;
          if (control.isCancelled()) return;
          commit(stream, {
            deltas,
            status: truncated ? "truncated" : "ready",
            ...(truncated ? { truncated: true } : {}),
          });
        } catch {
          if (control.isCancelled()) return;
          commit(stream, { deltas: [], status: "error" });
        }
      },
    });
  }, [playbackStore, sceneAnnotationStreams, setHistory, session, sourceKey]);

  // This effect clears shared history when the bridge leaves the provider.
  useEffect(
    () => () => {
      setHistory(EMPTY_HISTORY);
    },
    [setHistory],
  );

  return null;
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
