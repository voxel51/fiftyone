// Deep import on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge has direct unit tests (same rule as numeric-series-context).
import { PlaybackStoreContext } from "@fiftyone/playback/runtime";
import { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import {
  createDemandFailureBackoff,
  createDemandInventoryMachine,
  startDemandBridge,
} from "../../../runtime";
import {
  createDemandContextProvider,
  useResetDemandContextOnUnmount,
  type DemandContextHandlers,
} from "../../../runtime/react";
import type { RawRecordResult, RawRecordStream } from "../../../ir";
import type { RawRecordCapability } from "../../../ports";
import { errorMessage } from "../../../utils/errors";
import { shouldDeferIdleWorkForStore } from "../playback/network-health";
import { useDataStream } from "../playback/data-stream-context";

/** Playhead-driven refetches run at most this often per bridge tick. */
const PLAYHEAD_THROTTLE_MS = 300;

/** Starved-link stand-down retry, matching the numeric-series gate. */
const DEFERRED_RETRY_MS = 2_000;

/** The timeline index lands moments after stream registration; wait for
 * it instead of fetching at a meaningless time. */
const TIMELINE_RETRY_MS = 250;

/**
 * One stream row for the raw-message stream picker: every channel in the
 * recording, renderable or not — making non-renderable streams
 * inspectable is the point of the raw tile.
 */
export type RawStreamInfo = RawRecordStream;

/**
 * Inventory read state for the raw-message stream picker.
 */
export interface RawStreamsState {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly streams: readonly RawStreamInfo[];
}

/**
 * One stream's record at the playhead. `ready` keeps the last result
 * visible through refetches; `error` only surfaces when there is
 * nothing older to show.
 */
export interface RawRecordState {
  readonly status: "loading" | "ready" | "error";
  readonly result?: RawRecordResult;
  readonly error?: string;
}

/**
 * Public raw-message cache and demand API consumed by raw-message tiles.
 */
export interface RawMessageContextValue {
  readonly streams: RawStreamsState;
  readonly recordsByStream: ReadonlyMap<string, RawRecordState>;

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

interface RawMessageHandlers extends DemandContextHandlers {
  readFullMessageJson(stream: string, timeNs: bigint): Promise<string>;
}

const IDLE_STREAMS: RawStreamsState = { status: "idle", streams: [] };
const EMPTY_RECORDS: ReadonlyMap<string, RawRecordState> = new Map();

const rawMessageDemandContext = createDemandContextProvider<
  RawStreamsState,
  RawRecordState,
  RawMessageHandlers
>({
  displayName: "RawMessageProvider",
  emptyValues: EMPTY_RECORDS,
  idleInventory: IDLE_STREAMS,
  missingProviderMessage:
    "episode raw messages must be used inside <RawMessageProvider>",
});

/**
 * Shares playhead-synced raw message records with raw-message tiles.
 * The provider holds state plus the interest registry;
 * `RawMessageBridge` inside the shell owns the client/source and
 * services demand, so a stream shown by several tiles is fetched once.
 */
export const RawMessageProvider = rawMessageDemandContext.Provider;

/**
 * Reads the raw-message cache and demand hooks for raw-message tiles.
 */
export function useRawMessageContext(): RawMessageContextValue {
  const { ensureInventory, handlersRef, inventory, subscribeKey, valuesByKey } =
    useInternalValue();
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
  return useMemo(
    () => ({
      ensureStreams: ensureInventory,
      readFullMessageJson,
      recordsByStream: valuesByKey,
      streams: inventory,
      subscribeRecord: subscribeKey,
    }),
    [
      ensureInventory,
      inventory,
      readFullMessageJson,
      subscribeKey,
      valuesByKey,
    ],
  );
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
export function RawMessageBridge({
  capability,
  sourceKey,
}: {
  readonly capability: RawRecordCapability | null;
  readonly sourceKey: string | null;
}) {
  const {
    handlersRef,
    inventoryReplay,
    publishValues,
    refCountsRef,
    reset,
    setInventory,
  } = useInternalValue();
  // Nullable on purpose: callers inside the playback shell provide the
  // store; standalone callers and tests fetch at the timeline start.
  const playbackStore = useContext(PlaybackStoreContext);
  const dataStream = useDataStream();
  const dataStreamRef = useRef(dataStream);
  dataStreamRef.current = dataStream;

  // This effect owns one source epoch: published records, demand
  // handlers, and the playhead-following loop. It re-keys (full reset)
  // when the source changes.
  useEffect(() => {
    reset();
    if (!capability || !sourceKey) {
      return undefined;
    }

    const published = new Map<string, RawRecordState>();
    const inflight = new Set<string>();
    const failures = createDemandFailureBackoff<string>();

    return startDemandBridge<
      RawMessageHandlers,
      NonNullable<typeof dataStream>
    >({
      dataStreamRef,
      deferredRetryMs: DEFERRED_RETRY_MS,
      handlersRef,
      inventoryReplay,
      makeHandlers: ({ isCancelled, queueFill }) => {
        const inventory = createDemandInventoryMachine({
          error: { status: "error", streams: [] },
          isCancelled,
          async load(publish) {
            const streams = await capability.listRawRecordStreams();
            publish({ status: "ready", streams });
          },
          loading: { status: "loading", streams: [] },
          publish: setInventory,
        });
        return {
          ensureInventory: inventory.ensure,
          onDemandChanged: queueFill,
          async readFullMessageJson(stream, timeNs) {
            const result = await capability.readRawRecord({
              includeFullJson: true,
              stream,
              timestampNs: timeNs,
            });
            if (result.status !== "ok" || result.fullJson === undefined) {
              throw new Error(
                `Could not read the complete message for ${stream}`,
              );
            }
            return result.fullJson;
          },
        };
      },
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
          if (failures.isBlocked(stream, now, userInitiated)) continue;

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
              failures.clear(stream);
              published.set(stream, { result: record, status: "ready" });
              publishValues(published, isCancelled);
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
              failures.record(stream, nowMs());
              // Keep whatever record already rendered; only surface a
              // hard error state when the stream has nothing to show.
              const previous = published.get(stream);
              if (!previous?.result) {
                published.set(stream, {
                  error: errorMessage(error),
                  status: "error",
                });
              }
              publishValues(published, isCancelled);
            });
        }
        if (publishNeeded) {
          publishValues(published, isCancelled);
        }
      },
      playbackStore,
      playheadThrottleMs: PLAYHEAD_THROTTLE_MS,
      refCountsRef,
      requireTimeline: true,
      shouldDeferIdleWork: (store) => shouldDeferIdleWorkForStore(store, null),
      timelineRetryMs: TIMELINE_RETRY_MS,
    });
  }, [
    capability,
    handlersRef,
    inventoryReplay,
    playbackStore,
    publishValues,
    refCountsRef,
    reset,
    setInventory,
    sourceKey,
  ]);

  useResetDemandContextOnUnmount(reset);

  return null;
}

function useInternalValue() {
  return rawMessageDemandContext.useDemandContext();
}
