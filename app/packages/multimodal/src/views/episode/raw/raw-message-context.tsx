// Deep import on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge has direct unit tests (same rule as numeric-series-context).
import { PlaybackStoreContext } from "@fiftyone/playback/runtime";
import {
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  createDemandFailureBackoff,
  createDemandInventoryMachine,
  DEMAND_FAILURE_BACKOFF_MS,
  startDemandBridge,
} from "../../../runtime";
import {
  createDemandContextProvider,
  useResetDemandContextOnUnmount,
  type DemandContextHandlers,
} from "../../../runtime/react";
import type {
  RawRecordCursor,
  RawRecordIndexWindow,
  RawRecordIndexWindowRequest,
  RawRecordResult,
  RawRecordStream,
} from "../../../ir";
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
 * One stream's record at the playhead. A retained result remains visible
 * through refetches, while `loading`/`error` honestly mark it stale.
 */
export interface RawRecordState {
  readonly status: "loading" | "ready" | "error";
  readonly result?: RawRecordResult;
  readonly error?: string;
  /** Latest coalesced Message-panel target this state is resolving. */
  readonly targetNs?: bigint;
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
  ensureStreams(this: void): void;

  /**
   * Reads the complete decoded message behind an inspector result as bounded,
   * compact JSON. The payload is fetched only for an explicit copy action and
   * byte buffers use a base64 envelope.
   */
  readFullMessageJson(
    this: void,
    stream: string,
    anchor: bigint | RawRecordCursor,
    signal?: AbortSignal,
  ): Promise<string>;

  /** Reads a selected exact record on the explicit interactive lane. */
  readRecordAtCursor(
    this: void,
    stream: string,
    cursor: RawRecordCursor,
    signal?: AbortSignal,
  ): Promise<RawRecordResult>;

  /** Reads a bounded exact index window without decoding its rows. */
  readRecordIndexWindow(
    this: void,
    stream: string,
    request: RawRecordIndexWindowRequest,
    signal?: AbortSignal,
  ): Promise<RawRecordIndexWindow>;

  /**
   * Declares interest in one stream's record while the returned
   * unsubscribe is outstanding. Interested streams follow the playhead;
   * results are kept after unsubscribe for the life of the source.
   */
  subscribeRecord(this: void, stream: string): () => void;
}

type RawMessageHandlers = DemandContextHandlers &
  Pick<
    RawMessageContextValue,
    "readFullMessageJson" | "readRecordAtCursor" | "readRecordIndexWindow"
  >;

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
    (
      stream: string,
      anchor: bigint | RawRecordCursor,
      signal?: AbortSignal,
    ) => {
      const handlers = handlersRef.current;
      if (!handlers) {
        return Promise.reject(
          new Error("episode message reader is unavailable"),
        );
      }
      return handlers.readFullMessageJson(stream, anchor, signal);
    },
    [handlersRef],
  );
  const readRecordAtCursor = useCallback(
    (stream: string, cursor: RawRecordCursor, signal?: AbortSignal) => {
      const handlers = handlersRef.current;
      return handlers
        ? handlers.readRecordAtCursor(stream, cursor, signal)
        : Promise.reject(new Error("episode message reader is unavailable"));
    },
    [handlersRef],
  );
  const readRecordIndexWindow = useCallback(
    (
      stream: string,
      request: Parameters<RawMessageHandlers["readRecordIndexWindow"]>[1],
      signal?: AbortSignal,
    ) => {
      const handlers = handlersRef.current;
      return handlers
        ? handlers.readRecordIndexWindow(stream, request, signal)
        : Promise.reject(new Error("episode message index is unavailable"));
    },
    [handlersRef],
  );
  return useMemo(
    () => ({
      ensureStreams: ensureInventory,
      readFullMessageJson,
      readRecordAtCursor,
      readRecordIndexWindow,
      recordsByStream: valuesByKey,
      streams: inventory,
      subscribeRecord: subscribeKey,
    }),
    [
      ensureInventory,
      inventory,
      readFullMessageJson,
      readRecordAtCursor,
      readRecordIndexWindow,
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
 * and sparse streams cost zero reads. Continuous-playback reads ride the idle
 * lane and stand down while the link is starved. Explicit paused seeks use an
 * isolated inspection worker with background network admission, so they can
 * respond promptly without serializing image/3D playback work.
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
  // Clear the previous epoch before the browser paints the newly presented
  // source. A passive reset leaves one frame where a persisted raw tile can
  // display the previous recording's message under the new recording header.
  useLayoutEffect(() => {
    reset();
    if (!capability || !sourceKey) {
      return undefined;
    }

    const published = new Map<string, RawRecordState>();
    const inflight = new Map<
      string,
      {
        readonly controller: AbortController;
        readonly expedited: boolean;
        readonly targetNs: bigint;
      }
    >();
    const desiredTargets = new Map<string, bigint>();
    const desiredExpedited = new Map<string, boolean>();
    const failureRetryTokens = new Map<string, object>();
    const failures = createDemandFailureBackoff<string>();
    const epochController = new AbortController();

    const stopBridge = startDemandBridge<
      RawMessageHandlers,
      NonNullable<typeof dataStream>
    >({
      dataStreamRef,
      deferredRetryMs: DEFERRED_RETRY_MS,
      expeditePausedSeeks: true,
      handlersRef,
      inventoryReplay,
      makeHandlers: ({ isCancelled, queueFill }) => {
        const inventory = createDemandInventoryMachine({
          error: { status: "error", streams: [] },
          isCancelled,
          async load(publish) {
            const streams = await capability.listRawRecordStreams({
              signal: epochController.signal,
            });
            publish({ status: "ready", streams });
          },
          loading: { status: "loading", streams: [] },
          publish: setInventory,
        });
        return {
          ensureInventory: inventory.ensure,
          onDemandChanged: queueFill,
          async readFullMessageJson(stream, anchor, signal) {
            const linked = linkAbortSignals(epochController.signal, signal);
            try {
              if (
                typeof anchor === "string" &&
                !capability.readRawRecordAtCursor
              ) {
                throw new Error(
                  `Exact message reads are unavailable for ${stream}`,
                );
              }
              const result =
                typeof anchor === "string"
                  ? await capability.readRawRecordAtCursor?.({
                      cursor: anchor,
                      includeFullJson: true,
                      intent: "export",
                      signal: linked.signal,
                      stream,
                    })
                  : await capability.readRawRecord({
                      includeFullJson: true,
                      intent: "export",
                      signal: linked.signal,
                      stream,
                      timestampNs: anchor,
                    });
              if (
                !result ||
                result.status !== "ok" ||
                result.fullJson === undefined
              ) {
                throw new Error(
                  `Could not read the complete message for ${stream}`,
                );
              }
              if (typeof anchor === "string" && result.cursor !== anchor) {
                throw new Error(
                  `Exact message copy returned a different cursor for ${stream}`,
                );
              }
              return result.fullJson;
            } finally {
              linked.cleanup();
            }
          },
          async readRecordAtCursor(stream, cursor, signal) {
            if (!capability.readRawRecordAtCursor) {
              throw new Error(
                `Exact message reads are unavailable for ${stream}`,
              );
            }
            const linked = linkAbortSignals(epochController.signal, signal);
            try {
              return await capability.readRawRecordAtCursor({
                cursor,
                signal: linked.signal,
                stream,
              });
            } finally {
              linked.cleanup();
            }
          },
          async readRecordIndexWindow(stream, request, signal) {
            if (!capability.readRawRecordIndexWindow) {
              throw new Error(
                `Exact message indexes are unavailable for ${stream}`,
              );
            }
            const linked = linkAbortSignals(epochController.signal, signal);
            try {
              return await capability.readRawRecordIndexWindow({
                ...request,
                signal: linked.signal,
                stream,
              });
            } finally {
              linked.cleanup();
            }
          },
        };
      },
      onFill({
        demandKeys,
        expedited,
        isCancelled,
        later,
        nowMs,
        playheadSec,
        queueExpeditedFill,
        queueImmediateFill,
        timeline,
        userInitiated,
      }) {
        if (!timeline) {
          return;
        }
        const demandedStreams = [...demandKeys];
        const demanded = new Set(demandedStreams);
        for (const [stream, read] of inflight) {
          if (demanded.has(stream)) continue;
          read.controller.abort();
          inflight.delete(stream);
        }
        for (const stream of desiredTargets.keys()) {
          if (demanded.has(stream)) continue;
          desiredTargets.delete(stream);
          desiredExpedited.delete(stream);
          failureRetryTokens.delete(stream);
        }
        const playheadNs = timeline.secToNs(playheadSec);

        const now = nowMs();
        let publishNeeded = false;
        for (const stream of demandedStreams) {
          const previousTarget = desiredTargets.get(stream);
          desiredTargets.set(stream, playheadNs);
          desiredExpedited.set(
            stream,
            expedited ||
              (previousTarget === playheadNs &&
                desiredExpedited.get(stream) === true),
          );

          const activeRead = inflight.get(stream);
          if (activeRead) {
            // Only explicit paused intent supersedes in-flight work. During
            // playback, letting the idle read finish avoids cancellation
            // churn; its completion is validated against desiredTargets.
            if (
              expedited &&
              (!activeRead.expedited || activeRead.targetNs !== playheadNs)
            ) {
              activeRead.controller.abort();
              inflight.delete(stream);
            } else {
              continue;
            }
          }
          const state = published.get(stream);
          const result = state?.result;
          if (
            result &&
            playheadNs >= result.validFromNs &&
            playheadNs < result.validUntilNs
          ) {
            if (state.status !== "ready" || state.targetNs !== playheadNs) {
              published.set(stream, {
                result,
                status: "ready",
                targetNs: playheadNs,
              });
              publishNeeded = true;
            }
            continue;
          }
          if (failures.isBlocked(stream, now, userInitiated)) continue;

          const controller = new AbortController();
          const readExpedited = desiredExpedited.get(stream) === true;
          inflight.set(stream, {
            controller,
            expedited: readExpedited,
            targetNs: playheadNs,
          });
          published.set(stream, {
            ...(result ? { result } : {}),
            status: "loading",
            targetNs: playheadNs,
          });
          publishNeeded = true;
          void capability
            .readRawRecord({
              intent: readExpedited ? "paused-inspection" : "background",
              signal: controller.signal,
              stream,
              timestampNs: playheadNs,
            })
            .then((record) => {
              if (
                isCancelled() ||
                controller.signal.aborted ||
                inflight.get(stream)?.controller !== controller
              ) {
                return;
              }
              inflight.delete(stream);
              failures.clear(stream);
              failureRetryTokens.delete(stream);
              const latestTargetNs = desiredTargets.get(stream);
              if (latestTargetNs === undefined) {
                return;
              }
              if (
                latestTargetNs >= record.validFromNs &&
                latestTargetNs < record.validUntilNs
              ) {
                published.set(stream, {
                  result: record,
                  status: "ready",
                  targetNs: latestTargetNs,
                });
                publishValues(published, isCancelled);
                return;
              }

              // Never present an out-of-window completion as current. Keep
              // the prior record explicitly stale and admit the latest target
              // immediately; a paused supersession retains inspection intent.
              const previous = published.get(stream);
              if (latestTargetNs === playheadNs) {
                published.set(stream, {
                  error: "Message reader returned an invalid validity window",
                  ...(previous?.result ? { result: previous.result } : {}),
                  status: "error",
                  targetNs: latestTargetNs,
                });
                publishValues(published, isCancelled);
                return;
              }
              published.set(stream, {
                ...(previous?.result ? { result: previous.result } : {}),
                status: "loading",
                targetNs: latestTargetNs,
              });
              publishValues(published, isCancelled);
              if (desiredExpedited.get(stream)) queueExpeditedFill();
              else queueImmediateFill();
            })
            .catch((error: unknown) => {
              if (inflight.get(stream)?.controller === controller) {
                inflight.delete(stream);
              }
              if (isCancelled() || controller.signal.aborted) {
                return;
              }
              failures.record(stream, nowMs());
              const previous = published.get(stream);
              published.set(stream, {
                error: errorMessage(error),
                ...(previous?.result ? { result: previous.result } : {}),
                status: "error",
                targetNs: desiredTargets.get(stream),
              });
              publishValues(published, isCancelled);

              const retryToken = {};
              failureRetryTokens.set(stream, retryToken);
              later(() => {
                if (
                  isCancelled() ||
                  failureRetryTokens.get(stream) !== retryToken ||
                  !desiredTargets.has(stream)
                ) {
                  return;
                }
                failureRetryTokens.delete(stream);
                if (desiredExpedited.get(stream)) queueExpeditedFill();
                else queueImmediateFill();
              }, DEMAND_FAILURE_BACKOFF_MS);
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
    return () => {
      epochController.abort();
      for (const read of inflight.values()) read.controller.abort();
      inflight.clear();
      stopBridge();
    };
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

/** Links source-epoch and user cancellation without requiring AbortSignal.any. */
function linkAbortSignals(
  epochSignal: AbortSignal,
  requestSignal?: AbortSignal,
): { readonly cleanup: () => void; readonly signal: AbortSignal } {
  if (!requestSignal) {
    return { cleanup: () => undefined, signal: epochSignal };
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (epochSignal.aborted || requestSignal.aborted) {
    controller.abort();
  } else {
    epochSignal.addEventListener("abort", abort, { once: true });
    requestSignal.addEventListener("abort", abort, { once: true });
  }
  return {
    cleanup: () => {
      epochSignal.removeEventListener("abort", abort);
      requestSignal.removeEventListener("abort", abort);
    },
    signal: controller.signal,
  };
}
