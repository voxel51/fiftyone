// Deep import on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge has direct unit tests (same rule as mcap-numeric-series-context).
import { PlaybackStoreContext } from "@fiftyone/playback/src/lib/playback/playback-store-context";
import {
  getPlayhead,
  subscribePlayhead,
} from "@fiftyone/playback/src/lib/playback/store-access";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import { byteSourceAccessKey } from "../../../query/bytes";
import type { StreamInventory } from "../../../schemas/v1";
import type { McapRawMessageRecordResult, McapResourceClient } from "../types";
import { useMcapDataStream } from "./mcap-data-stream-context";
import { shouldDeferMcapIdleWorkForStore } from "./mcap-network-health";

/** Playhead-driven refetches run at most this often per bridge tick. */
const PLAYHEAD_THROTTLE_MS = 300;

/** Starved-link stand-down retry, matching the numeric-series gate. */
const DEFERRED_RETRY_MS = 2_000;

/** The timeline index lands moments after stream registration; wait for
 * it instead of fetching at a meaningless time. */
const TIMELINE_RETRY_MS = 250;

/** Playhead-driven retries of a failed topic back off this long; a user
 * re-subscribe retries immediately. */
const FAILURE_BACKOFF_MS = 5_000;

/**
 * One topic row for the raw-message topic picker: every channel in the
 * recording, renderable or not — making non-renderable topics
 * inspectable is the point of the raw tile.
 */
export interface McapRawTopicInfo {
  readonly topic: string;
  readonly schemaName: string | null;
  readonly messageEncoding: string;
  readonly messageCount: number | null;
}

export interface McapRawTopicsState {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly topics: readonly McapRawTopicInfo[];
}

/**
 * One topic's record at the playhead. `ready` keeps the last result
 * visible through refetches; `error` only surfaces when there is
 * nothing older to show.
 */
export interface McapRawRecordState {
  readonly status: "loading" | "ready" | "error";
  readonly result?: McapRawMessageRecordResult;
  readonly error?: string;
}

export interface McapRawMessageContextValue {
  readonly topics: McapRawTopicsState;
  readonly recordsByTopic: ReadonlyMap<string, McapRawRecordState>;

  /**
   * Idempotently kicks the all-topics inventory read for the picker.
   */
  ensureTopics(): void;

  /**
   * Declares interest in one topic's record while the returned
   * unsubscribe is outstanding. Interested topics follow the playhead;
   * results are kept after unsubscribe for the life of the source.
   */
  subscribeRecord(topic: string): () => void;
}

interface McapRawMessageHandlers {
  ensureTopics(): void;
  onDemandChanged(): void;
}

interface McapRawMessageInternalValue extends McapRawMessageContextValue {
  readonly handlersRef: React.MutableRefObject<McapRawMessageHandlers | null>;
  readonly refCountsRef: React.MutableRefObject<Map<string, number>>;
  readonly topicsWantedRef: React.MutableRefObject<boolean>;
  readonly setTopics: (state: McapRawTopicsState) => void;
  readonly setRecordsByTopic: (
    state: ReadonlyMap<string, McapRawRecordState>,
  ) => void;
}

const IDLE_TOPICS: McapRawTopicsState = { status: "idle", topics: [] };
const EMPTY_RECORDS: ReadonlyMap<string, McapRawRecordState> = new Map();

const McapRawMessageContext = createContext<McapRawMessageInternalValue | null>(
  null,
);

/**
 * Shares playhead-synced raw message records with raw-message tiles.
 * The provider holds state plus the interest registry;
 * `McapRawMessageBridge` inside the shell owns the client/source and
 * services demand, so a topic shown by several tiles is fetched once.
 */
export const McapRawMessageProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [topics, setTopics] = useState<McapRawTopicsState>(IDLE_TOPICS);
  const [recordsByTopic, setRecordsByTopic] =
    useState<ReadonlyMap<string, McapRawRecordState>>(EMPTY_RECORDS);
  const handlersRef = useRef<McapRawMessageHandlers | null>(null);
  const refCountsRef = useRef(new Map<string, number>());
  const topicsWantedRef = useRef(false);

  const ensureTopics = useCallback(() => {
    topicsWantedRef.current = true;
    handlersRef.current?.ensureTopics();
  }, []);

  const subscribeRecord = useCallback((topic: string) => {
    const counts = refCountsRef.current;
    counts.set(topic, (counts.get(topic) ?? 0) + 1);
    handlersRef.current?.onDemandChanged();
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const current = counts.get(topic) ?? 0;
      if (current <= 1) {
        counts.delete(topic);
      } else {
        counts.set(topic, current - 1);
      }
    };
  }, []);

  const value = useMemo<McapRawMessageInternalValue>(
    () => ({
      ensureTopics,
      handlersRef,
      recordsByTopic,
      refCountsRef,
      setRecordsByTopic,
      setTopics,
      subscribeRecord,
      topics,
      topicsWantedRef,
    }),
    [ensureTopics, recordsByTopic, subscribeRecord, topics],
  );

  return (
    <McapRawMessageContext.Provider value={value}>
      {children}
    </McapRawMessageContext.Provider>
  );
};

/**
 * Reads the raw-message cache and demand hooks for raw-message tiles.
 */
export function useMcapRawMessageContext(): McapRawMessageContextValue {
  return useInternalValue();
}

/**
 * Bridge that services raw-record demand against the shared resource
 * client. Reads are single-message and playhead-anchored: each result
 * carries a validity window (`[validFromNs, validUntilNs)`), so a topic
 * only refetches when the playhead leaves the window — paused playback
 * and sparse topics cost zero reads. Reads ride the idle lane (never
 * ahead of current-frame or playback work) and stand down while the
 * link is starved, same gate as the numeric-series bridge.
 */
export function McapRawMessageBridge({
  client,
  source,
}: {
  readonly client: McapResourceClient;
  readonly source: ByteSourceDescriptor | null;
}) {
  const {
    handlersRef,
    refCountsRef,
    setRecordsByTopic,
    setTopics,
    topicsWantedRef,
  } = useInternalValue();
  // Nullable on purpose: callers inside the playback shell provide the
  // store; standalone callers and tests fetch at the timeline start.
  const playbackStore = useContext(PlaybackStoreContext);
  const dataStream = useMcapDataStream();
  const dataStreamRef = useRef(dataStream);
  dataStreamRef.current = dataStream;
  const sourceKey = source ? byteSourceAccessKey(source) : null;

  // This effect owns one source epoch: published records, demand
  // handlers, and the playhead-following loop. It re-keys (full reset)
  // when the source changes.
  useEffect(() => {
    setTopics(IDLE_TOPICS);
    setRecordsByTopic(EMPTY_RECORDS);
    if (!source || !sourceKey) {
      return undefined;
    }

    let cancelled = false;
    let topicsRequested = false;
    let fillQueued = false;
    let deferPending = false;
    let lastPlayheadFillMs = Number.NEGATIVE_INFINITY;
    const published = new Map<string, McapRawRecordState>();
    const inflight = new Set<string>();
    const failedAtMs = new Map<string, number>();
    const timeouts = new Set<ReturnType<typeof setTimeout>>();

    const later = (callback: () => void, ms: number) => {
      const timeout = setTimeout(() => {
        timeouts.delete(timeout);
        callback();
      }, ms);
      timeouts.add(timeout);
    };

    const publish = () => {
      if (!cancelled) {
        setRecordsByTopic(new Map(published));
      }
    };

    const fill = (userInitiated: boolean) => {
      if (cancelled || refCountsRef.current.size === 0) {
        return;
      }

      // Idle-lane reads share the physical link with foreground
      // catch-up; while the link is starved, stand down and re-check
      // (verbatim numeric-series policy).
      if (
        playbackStore &&
        shouldDeferMcapIdleWorkForStore(playbackStore, null)
      ) {
        if (!deferPending) {
          deferPending = true;
          later(() => {
            deferPending = false;
            fill(userInitiated);
          }, DEFERRED_RETRY_MS);
        }
        return;
      }

      const timeline = dataStreamRef.current?.getTimelineIndex() ?? null;
      if (!timeline) {
        later(() => fill(userInitiated), TIMELINE_RETRY_MS);
        return;
      }
      const playheadNs = timeline.secToNs(
        playbackStore ? getPlayhead(playbackStore) : 0,
      );

      const now = nowMs();
      let publishNeeded = false;
      for (const topic of refCountsRef.current.keys()) {
        if (inflight.has(topic)) {
          continue;
        }
        const state = published.get(topic);
        const result = state?.result;
        if (
          result &&
          playheadNs >= result.validFromNs &&
          playheadNs < result.validUntilNs
        ) {
          continue;
        }
        if (!userInitiated) {
          const failed = failedAtMs.get(topic);
          if (failed !== undefined && now - failed < FAILURE_BACKOFF_MS) {
            continue;
          }
        }

        inflight.add(topic);
        if (!state) {
          published.set(topic, { status: "loading" });
          publishNeeded = true;
        }
        void client
          .readRawMessageRecord({ source, timeNs: playheadNs, topic })
          .then((record) => {
            if (cancelled) {
              return;
            }
            inflight.delete(topic);
            failedAtMs.delete(topic);
            published.set(topic, { result: record, status: "ready" });
            publish();
            // The playhead may have left this result's validity window
            // while the read was in flight; re-check instead of waiting
            // for the next playhead move (it may be paused now).
            queueFill();
          })
          .catch((error: unknown) => {
            if (cancelled) {
              return;
            }
            inflight.delete(topic);
            failedAtMs.set(topic, nowMs());
            // Keep whatever record already rendered; only surface a
            // hard error state when the topic has nothing to show.
            const previous = published.get(topic);
            if (!previous?.result) {
              published.set(topic, {
                error: error instanceof Error ? error.message : String(error),
                status: "error",
              });
            }
            publish();
          });
      }
      if (publishNeeded) {
        publish();
      }
    };

    const queueFill = () => {
      if (fillQueued || cancelled) {
        return;
      }
      fillQueued = true;
      queueMicrotask(() => {
        fillQueued = false;
        fill(true);
      });
    };

    const handlers: McapRawMessageHandlers = {
      ensureTopics() {
        if (cancelled || topicsRequested) {
          return;
        }
        topicsRequested = true;
        setTopics({ status: "loading", topics: [] });
        void client
          .readTopics({ source })
          .then((streams) => {
            if (!cancelled) {
              setTopics({
                status: "ready",
                topics: streams.map(rawTopicInfoFromInventory),
              });
            }
          })
          .catch(() => {
            if (!cancelled) {
              topicsRequested = false;
              setTopics({ status: "error", topics: [] });
            }
          });
      },
      onDemandChanged: queueFill,
    };
    handlersRef.current = handlers;

    if (topicsWantedRef.current) {
      handlers.ensureTopics();
    }
    // Drain interest registered before this bridge (or source) mounted.
    queueFill();

    const unsubscribePlayhead = playbackStore
      ? subscribePlayhead(playbackStore, () => {
          const now = nowMs();
          if (now - lastPlayheadFillMs < PLAYHEAD_THROTTLE_MS) {
            return;
          }
          lastPlayheadFillMs = now;
          fill(false);
        })
      : undefined;

    return () => {
      cancelled = true;
      unsubscribePlayhead?.();
      for (const timeout of timeouts) {
        clearTimeout(timeout);
      }
      if (handlersRef.current === handlers) {
        handlersRef.current = null;
      }
    };
  }, [
    client,
    handlersRef,
    playbackStore,
    refCountsRef,
    setRecordsByTopic,
    setTopics,
    source,
    sourceKey,
    topicsWantedRef,
  ]);

  // This effect clears published state when the bridge unmounts while
  // the provider outlives it.
  useEffect(
    () => () => {
      setTopics(IDLE_TOPICS);
      setRecordsByTopic(EMPTY_RECORDS);
    },
    [setRecordsByTopic, setTopics],
  );

  return null;
}

/**
 * Maps one stream-inventory entry (all channels appear there, decodable
 * or not) onto the picker row shape.
 */
function rawTopicInfoFromInventory(stream: StreamInventory): McapRawTopicInfo {
  const count =
    stream.recordCount === undefined ? Number.NaN : Number(stream.recordCount);
  return {
    messageCount: Number.isFinite(count) && count > 0 ? count : null,
    messageEncoding: stream.metadata["mcap.message_encoding"] ?? "unknown",
    schemaName: stream.metadata["mcap.schema_name"] ?? null,
    topic: stream.metadata["mcap.topic"] ?? stream.displayName ?? "",
  };
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function useInternalValue(): McapRawMessageInternalValue {
  const value = useContext(McapRawMessageContext);
  if (!value) {
    throw new Error(
      "MCAP raw messages must be used inside <McapRawMessageProvider>",
    );
  }

  return value;
}
