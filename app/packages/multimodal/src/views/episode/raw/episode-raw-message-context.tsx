// Deep import on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge has direct unit tests (same rule as episode-numeric-series-context).
import { PlaybackStoreContext } from "@fiftyone/playback/runtime";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  startDemandBridge,
  useDemandRegistry,
  useEpisodeDataStream,
} from "../../../runtime";
import type { RawRecordResult, RawRecordStream } from "../../../ir";
import type { RawRecordCapability } from "../../../ports";
import { shouldDeferEpisodeIdleWorkForStore } from "../playback/episode-network-health";

/** Playhead-driven refetches run at most this often per bridge tick. */
const PLAYHEAD_THROTTLE_MS = 300;

/** Starved-link stand-down retry, matching the numeric-series gate. */
const DEFERRED_RETRY_MS = 2_000;

/** The timeline index lands moments after stream registration; wait for
 * it instead of fetching at a meaningless time. */
const TIMELINE_RETRY_MS = 250;

/** Playhead-driven retries of a failed stream back off this long; a user
 * re-subscribe retries immediately. */
const FAILURE_BACKOFF_MS = 5_000;

/**
 * One stream row for the raw-message stream picker: every channel in the
 * recording, renderable or not — making non-renderable streams
 * inspectable is the point of the raw tile.
 */
export type EpisodeRawStreamInfo = RawRecordStream;

/**
 * Inventory read state for the raw-message stream picker.
 */
export interface EpisodeRawStreamsState {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly streams: readonly EpisodeRawStreamInfo[];
}

/**
 * One stream's record at the playhead. `ready` keeps the last result
 * visible through refetches; `error` only surfaces when there is
 * nothing older to show.
 */
export interface EpisodeRawRecordState {
  readonly status: "loading" | "ready" | "error";
  readonly result?: RawRecordResult;
  readonly error?: string;
}

/**
 * Public raw-message cache and demand API consumed by raw-message tiles.
 */
export interface EpisodeRawMessageContextValue {
  readonly streams: EpisodeRawStreamsState;
  readonly recordsByStream: ReadonlyMap<string, EpisodeRawRecordState>;

  /**
   * Idempotently kicks the all-streams inventory read for the picker.
   */
  ensureStreams(): void;

  /**
   * Reads the complete decoded message behind an inspector result as JSON.
   * The large payload is fetched only for an explicit copy action.
   */
  readFullMessageJson(stream: string, timeNs: bigint): Promise<string>;

  /**
   * Declares interest in one stream's record while the returned
   * unsubscribe is outstanding. Interested streams follow the playhead;
   * results are kept after unsubscribe for the life of the source.
   */
  subscribeRecord(stream: string): () => void;
}

interface EpisodeRawMessageHandlers {
  ensureStreams(): void;
  onDemandChanged(): void;
  readFullMessageJson(stream: string, timeNs: bigint): Promise<string>;
}

interface EpisodeRawMessageInternalValue extends EpisodeRawMessageContextValue {
  readonly handlersRef: React.MutableRefObject<EpisodeRawMessageHandlers | null>;
  readonly refCountsRef: React.MutableRefObject<Map<string, number>>;
  readonly streamsWantedRef: React.MutableRefObject<boolean>;
  readonly setStreams: (state: EpisodeRawStreamsState) => void;
  readonly setRecordsByStream: (
    state: ReadonlyMap<string, EpisodeRawRecordState>,
  ) => void;
}

const IDLE_STREAMS: EpisodeRawStreamsState = { status: "idle", streams: [] };
const EMPTY_RECORDS: ReadonlyMap<string, EpisodeRawRecordState> = new Map();

const EpisodeRawMessageContext =
  createContext<EpisodeRawMessageInternalValue | null>(null);

/**
 * Shares playhead-synced raw message records with raw-message tiles.
 * The provider holds state plus the interest registry;
 * `EpisodeRawMessageBridge` inside the shell owns the client/source and
 * services demand, so a stream shown by several tiles is fetched once.
 */
export const EpisodeRawMessageProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [streams, setStreams] = useState<EpisodeRawStreamsState>(IDLE_STREAMS);
  const [recordsByStream, setRecordsByStream] =
    useState<ReadonlyMap<string, EpisodeRawRecordState>>(EMPTY_RECORDS);
  const { handlersRef, refCountsRef, subscribeKey } =
    useDemandRegistry<EpisodeRawMessageHandlers>();
  const streamsWantedRef = useRef(false);

  const ensureStreams = useCallback(() => {
    streamsWantedRef.current = true;
    handlersRef.current?.ensureStreams();
  }, [handlersRef]);

  const readFullMessageJson = useCallback(
    (stream: string, timeNs: bigint) => {
      const handlers = handlersRef.current;
      if (!handlers) {
        return Promise.reject(
          new Error("episode message reader is unavailable"),
        );
      }
      return handlers.readFullMessageJson(stream, timeNs);
    },
    [handlersRef],
  );

  const subscribeRecord = useCallback(
    (stream: string) => {
      return subscribeKey(stream);
    },
    [subscribeKey],
  );

  const value = useMemo<EpisodeRawMessageInternalValue>(
    () => ({
      ensureStreams,
      handlersRef,
      readFullMessageJson,
      recordsByStream,
      refCountsRef,
      setRecordsByStream,
      setStreams,
      subscribeRecord,
      streams,
      streamsWantedRef,
    }),
    [
      ensureStreams,
      handlersRef,
      readFullMessageJson,
      recordsByStream,
      refCountsRef,
      subscribeRecord,
      streams,
    ],
  );

  return (
    <EpisodeRawMessageContext.Provider value={value}>
      {children}
    </EpisodeRawMessageContext.Provider>
  );
};

/**
 * Reads the raw-message cache and demand hooks for raw-message tiles.
 */
export function useEpisodeRawMessageContext(): EpisodeRawMessageContextValue {
  return useInternalValue();
}

/**
 * Bridge that services raw-record demand against the shared resource
 * client. Reads are single-message and playhead-anchored: each result
 * carries a validity window (`[validFromNs, validUntilNs)`), so a stream
 * only refetches when the playhead leaves the window — paused playback
 * and sparse streams cost zero reads. Reads ride the idle lane (never
 * ahead of current-frame or playback work) and stand down while the
 * link is starved, same gate as the numeric-series bridge.
 */
export function EpisodeRawMessageBridge({
  capability,
  sourceKey,
}: {
  readonly capability: RawRecordCapability | null;
  readonly sourceKey: string | null;
}) {
  const {
    handlersRef,
    refCountsRef,
    setRecordsByStream,
    setStreams,
    streamsWantedRef,
  } = useInternalValue();
  // Nullable on purpose: callers inside the playback shell provide the
  // store; standalone callers and tests fetch at the timeline start.
  const playbackStore = useContext(PlaybackStoreContext);
  const dataStream = useEpisodeDataStream();
  const dataStreamRef = useRef(dataStream);
  dataStreamRef.current = dataStream;

  // This effect owns one source epoch: published records, demand
  // handlers, and the playhead-following loop. It re-keys (full reset)
  // when the source changes.
  useEffect(() => {
    setStreams(IDLE_STREAMS);
    setRecordsByStream(EMPTY_RECORDS);
    if (!capability || !sourceKey) {
      return undefined;
    }

    let streamsRequested = false;
    const published = new Map<string, EpisodeRawRecordState>();
    const inflight = new Set<string>();
    const failedAtMs = new Map<string, number>();

    const publish = (isCancelled: () => boolean) => {
      if (!isCancelled()) {
        setRecordsByStream(new Map(published));
      }
    };

    return startDemandBridge<
      EpisodeRawMessageHandlers,
      NonNullable<typeof dataStream>
    >({
      dataStreamRef,
      deferredRetryMs: DEFERRED_RETRY_MS,
      handlersRef,
      makeHandlers: ({ isCancelled, queueFill }) => ({
        ensureStreams() {
          if (isCancelled() || streamsRequested) {
            return;
          }
          streamsRequested = true;
          setStreams({ status: "loading", streams: [] });
          void capability
            .listRawRecordStreams()
            .then((streams) => {
              if (!isCancelled()) {
                setStreams({
                  status: "ready",
                  streams: streams,
                });
              }
            })
            .catch(() => {
              if (!isCancelled()) {
                streamsRequested = false;
                setStreams({ status: "error", streams: [] });
              }
            });
        },
        onDemandChanged: queueFill,
        async readFullMessageJson(stream, timeNs) {
          const result = await capability.readRawRecord({
            includeFullJson: true,
            stream: stream,
            timestampNs: timeNs,
          });
          if (result.status !== "ok" || result.fullJson === undefined) {
            throw new Error(
              `Could not read the complete message for ${stream}`,
            );
          }
          return result.fullJson;
        },
      }),
      onFill({
        demandKeys,
        isCancelled,
        nowMs,
        playheadSec,
        queueFill,
        timeline,
        userInitiated,
      }) {
        if (!timeline) {
          return;
        }
        const playheadNs = timeline.secToNs(playheadSec);

        const now = nowMs();
        let publishNeeded = false;
        for (const stream of demandKeys) {
          if (inflight.has(stream)) {
            continue;
          }
          const state = published.get(stream);
          const result = state?.result;
          if (
            result &&
            playheadNs >= result.validFromNs &&
            playheadNs < result.validUntilNs
          ) {
            continue;
          }
          if (!userInitiated) {
            const failed = failedAtMs.get(stream);
            if (failed !== undefined && now - failed < FAILURE_BACKOFF_MS) {
              continue;
            }
          }

          inflight.add(stream);
          if (!state) {
            published.set(stream, { status: "loading" });
            publishNeeded = true;
          }
          void capability
            .readRawRecord({ stream: stream, timestampNs: playheadNs })
            .then((record) => {
              if (isCancelled()) {
                return;
              }
              inflight.delete(stream);
              failedAtMs.delete(stream);
              published.set(stream, { result: record, status: "ready" });
              publish(isCancelled);
              // The playhead may have left this result's validity window
              // while the read was in flight; re-check instead of waiting
              // for the next playhead move (it may be paused now).
              queueFill();
            })
            .catch((error: unknown) => {
              if (isCancelled()) {
                return;
              }
              inflight.delete(stream);
              failedAtMs.set(stream, nowMs());
              // Keep whatever record already rendered; only surface a
              // hard error state when the stream has nothing to show.
              const previous = published.get(stream);
              if (!previous?.result) {
                published.set(stream, {
                  error: error instanceof Error ? error.message : String(error),
                  status: "error",
                });
              }
              publish(isCancelled);
            });
        }
        if (publishNeeded) {
          publish(isCancelled);
        }
      },
      onHandlersReady(handlers) {
        if (streamsWantedRef.current) {
          handlers.ensureStreams();
        }
      },
      playbackStore,
      playheadThrottleMs: PLAYHEAD_THROTTLE_MS,
      refCountsRef,
      requireTimeline: true,
      shouldDeferIdleWork: (store) =>
        shouldDeferEpisodeIdleWorkForStore(store, null),
      timelineRetryMs: TIMELINE_RETRY_MS,
    });
  }, [
    capability,
    handlersRef,
    playbackStore,
    refCountsRef,
    setRecordsByStream,
    setStreams,
    sourceKey,
    streamsWantedRef,
  ]);

  // This effect clears published state when the bridge unmounts while
  // the provider outlives it.
  useEffect(
    () => () => {
      setStreams(IDLE_STREAMS);
      setRecordsByStream(EMPTY_RECORDS);
    },
    [setRecordsByStream, setStreams],
  );

  return null;
}

function useInternalValue(): EpisodeRawMessageInternalValue {
  const value = useContext(EpisodeRawMessageContext);
  if (!value) {
    throw new Error(
      "episode raw messages must be used inside <EpisodeRawMessageProvider>",
    );
  }

  return value;
}
