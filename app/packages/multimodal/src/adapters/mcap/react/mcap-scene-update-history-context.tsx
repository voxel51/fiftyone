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
import {
  shouldDeferMcapBulkHistory,
  startMcapBulkTopicLifecycle,
} from "./mcap-bulk-topic-lifecycle";
import type { McapSceneUpdateDelta } from "./mcap-scene-update-state";

const SCENE_UPDATE_HISTORY_READ_LIMIT = 50_000;
const SCENE_UPDATE_HISTORY_START_DELAY_MS = 1_500;
const SCENE_UPDATE_HISTORY_DEFERRED_RETRY_MS = 2_000;

export interface McapSceneUpdateHistoryTopic {
  readonly deltas: readonly McapSceneUpdateDelta[];
  readonly status: "error" | "loading" | "ready" | "truncated";
  readonly truncated?: boolean;
}

export type McapSceneUpdateHistory = ReadonlyMap<
  string,
  McapSceneUpdateHistoryTopic
>;

const EMPTY_HISTORY: McapSceneUpdateHistory = new Map();

interface McapSceneUpdateHistoryContextValue {
  readonly history: McapSceneUpdateHistory;
  readonly setHistory: (state: McapSceneUpdateHistory) => void;
}

const McapSceneUpdateHistoryContext =
  createContext<McapSceneUpdateHistoryContextValue | null>(null);

/**
 * Shares full-topic scene-update histories with 3D tiles. These histories are
 * needed for correctness on stateful streams such as ROS MarkerArray: the
 * latest delta at a seek target is not enough to reconstruct older persistent
 * marker ids.
 */
export const McapSceneUpdateHistoryProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [history, setHistory] = useState<McapSceneUpdateHistory>(EMPTY_HISTORY);
  const value = useMemo(() => ({ history, setHistory }), [history]);

  return (
    <McapSceneUpdateHistoryContext.Provider value={value}>
      {children}
    </McapSceneUpdateHistoryContext.Provider>
  );
};

/**
 * Reads scene-update history when available. This hook is intentionally
 * optional because interpolation also runs in lightweight consumers that use
 * the live topic cache without mounting the full playback history bridge.
 */
export function useMcapSceneUpdateHistoryContext(): McapSceneUpdateHistory {
  return useContext(McapSceneUpdateHistoryContext)?.history ?? EMPTY_HISTORY;
}

export function McapSceneUpdateHistoryBridge({
  client,
  sceneAnnotationTopics,
  source,
}: {
  readonly client: McapResourceClient;
  readonly sceneAnnotationTopics: readonly string[];
  readonly source: ByteSourceDescriptor | null;
}) {
  const { setHistory } = useContextValue();
  const sourceKey = source ? byteSourceAccessKey(source) : null;
  const historyRef = useRef(new Map<string, McapSceneUpdateHistoryTopic>());
  const playbackStore = useContext(PlaybackStoreContext);

  useEffect(() => {
    historyRef.current = new Map();
    setHistory(EMPTY_HISTORY);

    if (!sourceKey || !source || sceneAnnotationTopics.length === 0) {
      return undefined;
    }

    const commit = (topic: string, state: McapSceneUpdateHistoryTopic) => {
      historyRef.current.set(topic, state);
      setHistory(new Map(historyRef.current));
    };

    return startMcapBulkTopicLifecycle({
      initialDelayMs: SCENE_UPDATE_HISTORY_START_DELAY_MS,
      retryDelayMs: SCENE_UPDATE_HISTORY_DEFERRED_RETRY_MS,
      shouldStandDown: () => shouldDeferMcapBulkHistory(playbackStore),
      topics: sceneAnnotationTopics,
      runTopic: async (topic, control) => {
        commit(topic, { deltas: [], status: "loading" });

        const deltas: McapSceneUpdateDelta[] = [];
        let messageCount = 0;
        try {
          for await (const message of client.readDecodedMessages(
            {
              activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
              limit: SCENE_UPDATE_HISTORY_READ_LIMIT,
              source,
              topics: [topic],
            },
            { priority: "bulk" },
          )) {
            if (control.isCancelled()) return;
            if (control.standDown()) return;
            messageCount += 1;
            const visualization = message.decoded.output.visualization;
            if (visualization?.kind !== VISUALIZATION_KIND.SCENE_UPDATE) {
              continue;
            }
            deltas.push({
              timeNs: message.timelineTimeNs,
              update: visualization,
            });
          }

          const truncated = messageCount >= SCENE_UPDATE_HISTORY_READ_LIMIT;
          if (control.isCancelled()) return;
          commit(topic, {
            deltas,
            status: truncated ? "truncated" : "ready",
            ...(truncated ? { truncated: true } : {}),
          });
        } catch {
          if (control.isCancelled()) return;
          commit(topic, { deltas: [], status: "error" });
        }
      },
    });
  }, [
    client,
    playbackStore,
    sceneAnnotationTopics,
    setHistory,
    source,
    sourceKey,
  ]);

  useEffect(
    () => () => {
      setHistory(EMPTY_HISTORY);
    },
    [setHistory],
  );

  return null;
}

function useContextValue(): McapSceneUpdateHistoryContextValue {
  const value = useContext(McapSceneUpdateHistoryContext);
  if (!value) {
    throw new Error(
      "MCAP scene update history must be used inside <McapSceneUpdateHistoryProvider>",
    );
  }
  return value;
}
