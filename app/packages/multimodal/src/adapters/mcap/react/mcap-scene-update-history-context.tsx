import { PlaybackStoreContext } from "@fiftyone/playback/src/lib/playback/playback-store-context";
import { getIsPlaying } from "@fiftyone/playback/src/lib/playback/store-access";
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
  getMcapNetworkHealth,
  shouldDeferMcapIdleWorkForStore,
} from "./mcap-network-health";
import type { McapSceneUpdateDelta } from "./mcap-scene-update-state";

const SCENE_UPDATE_HISTORY_READ_LIMIT = 50_000;
const SCENE_UPDATE_HISTORY_START_DELAY_MS = 1_500;
const SCENE_UPDATE_HISTORY_DEFERRED_RETRY_MS = 2_000;

export interface McapSceneUpdateHistoryTopic {
  readonly deltas: readonly McapSceneUpdateDelta[];
  readonly status: "error" | "loading" | "ready";
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
  const fetchedTopicsRef = useRef(new Set<string>());
  const historyRef = useRef(new Map<string, McapSceneUpdateHistoryTopic>());
  const playbackStore = useContext(PlaybackStoreContext);

  useEffect(() => {
    fetchedTopicsRef.current = new Set();
    historyRef.current = new Map();
    setHistory(EMPTY_HISTORY);

    if (!sourceKey || !source || sceneAnnotationTopics.length === 0) {
      return undefined;
    }

    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    const activeTopics = new Set(sceneAnnotationTopics);
    const commit = (topic: string, state: McapSceneUpdateHistoryTopic) => {
      if (cancelled) {
        return;
      }
      historyRef.current.set(topic, state);
      setHistory(new Map(historyRef.current));
    };

    const shouldStandDown = (): boolean => {
      if (!playbackStore) {
        return false;
      }
      if (
        getIsPlaying(playbackStore) &&
        getMcapNetworkHealth(playbackStore).limited
      ) {
        return true;
      }
      return shouldDeferMcapIdleWorkForStore(playbackStore, null);
    };

    const scheduleRetry = (delayMs: number) => {
      if (cancelled || retryTimeout !== null) {
        return;
      }
      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        start();
      }, delayMs);
    };

    const start = () => {
      if (cancelled) {
        return;
      }
      if (shouldStandDown()) {
        scheduleRetry(SCENE_UPDATE_HISTORY_DEFERRED_RETRY_MS);
        return;
      }

      for (const topic of sceneAnnotationTopics) {
        if (!activeTopics.has(topic) || fetchedTopicsRef.current.has(topic)) {
          continue;
        }
        fetchedTopicsRef.current.add(topic);
        commit(topic, { deltas: [], status: "loading" });

        void (async () => {
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
              if (cancelled) {
                return;
              }
              if (shouldStandDown()) {
                fetchedTopicsRef.current.delete(topic);
                scheduleRetry(SCENE_UPDATE_HISTORY_DEFERRED_RETRY_MS);
                return;
              }
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

            commit(topic, {
              deltas,
              status: "ready",
              ...(messageCount >= SCENE_UPDATE_HISTORY_READ_LIMIT
                ? { truncated: true }
                : {}),
            });
          } catch {
            commit(topic, { deltas: [], status: "error" });
          }
        })();
      }
    };

    scheduleRetry(SCENE_UPDATE_HISTORY_START_DELAY_MS);

    return () => {
      cancelled = true;
      if (retryTimeout !== null) {
        clearTimeout(retryTimeout);
      }
    };
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
