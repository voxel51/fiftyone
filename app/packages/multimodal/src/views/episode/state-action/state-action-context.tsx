// Deep import on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge has direct unit tests (same rule as raw-message-context).
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
} from "../../../ir";
import type {
  StateActionCapability,
  StateActionEpisodeProfile,
  StateActionRow,
  StateActionSchema,
  StateActionStats,
} from "../../../ports";
import { errorMessage } from "../../../utils/errors";
import { shouldDeferIdleWorkForStore } from "../playback/network-health";
import { useDataStream } from "../playback/data-stream-context";

/** Playhead-driven relookups run at most this often per bridge tick. */
const PLAYHEAD_THROTTLE_MS = 300;

/** Starved-link stand-down retry, matching the raw-message gate. */
const DEFERRED_RETRY_MS = 2_000;

/** The timeline index lands moments after stream registration; wait for
 * it instead of resolving at a meaningless time. */
const TIMELINE_RETRY_MS = 250;

/** A refetch over a committed row surfaces a pending state only after this
 * delay, so in-memory relookups during playback do not flash the table. */
const PENDING_ROW_BADGE_MS = 150;

/** The single demand key: one canonical row follows the shared playhead. */
const ROW_KEY = "state-action:row";

/** Session schema facts published at bridge start; no read required. */
export interface StateActionSchemaState {
  readonly schema: StateActionSchema | null;
  readonly status: "idle" | "ready";
}

/**
 * The one committed exact row. A retained row remains visible through
 * refetches while `loading`/`error` honestly mark it stale. `row: null`
 * means the playhead resolved to no row (before the first row).
 */
export interface StateActionRowState {
  readonly error?: string;
  /** Row pinned by exact cursor stepping; the echoed paused seek to its
   * timestamp must not re-resolve through time or replace it. */
  readonly pinned?: boolean;
  readonly row?: StateActionRow | null;
  readonly status: "loading" | "ready" | "error";
  /** Latest coalesced playhead target this state is resolving. */
  readonly targetNs?: bigint;
}

/** Public state/action cache and demand API consumed by the tile. */
export interface StateActionContextValue {
  readonly rowState: StateActionRowState | undefined;
  readonly schema: StateActionSchemaState;

  /**
   * Idempotently (re)publishes the session schema. Tiles call this from a
   * passive effect so the publication survives shell remounts, whose stale
   * unmount cleanups can otherwise wipe a one-shot layout-phase publish.
   */
  ensureSchema(): void;

  /**
   * Pins one cursor-selected row and predicts the paused-seek echo so the
   * bridge keeps the exact row instead of re-resolving through time.
   */
  holdCursorRow(row: StateActionRow, echoNs: bigint): void;

  /** Reads one exact row on the explicit interactive lane. */
  readRowAtCursor(
    cursor: RawRecordCursor,
    signal?: AbortSignal,
  ): Promise<StateActionRow>;

  /** Reads a bounded exact index window without decoding its rows. */
  readRowIndexWindow(
    request: RawRecordIndexWindowRequest,
    signal?: AbortSignal,
  ): Promise<RawRecordIndexWindow>;

  /** Source-declared per-dimension statistics, or null when absent. */
  readDimensionStats(signal?: AbortSignal): Promise<StateActionStats | null>;

  /** Episode-computed profile, or null when the provider cannot profile. */
  readEpisodeProfile(
    signal?: AbortSignal,
  ): Promise<StateActionEpisodeProfile | null>;

  /** User-initiated retry after a failed read; bypasses the backoff. */
  retryRead(): void;

  /**
   * Declares interest in the canonical row while the returned unsubscribe
   * is outstanding. Interested tiles follow the playhead together.
   */
  subscribeRow(): () => void;
}

type StateActionHandlers = DemandContextHandlers & {
  holdCursorRow(row: StateActionRow, echoNs: bigint): void;
  readDimensionStats(signal?: AbortSignal): Promise<StateActionStats | null>;
  readEpisodeProfile(
    signal?: AbortSignal,
  ): Promise<StateActionEpisodeProfile | null>;
  readRowAtCursor(
    cursor: RawRecordCursor,
    signal?: AbortSignal,
  ): Promise<StateActionRow>;
  readRowIndexWindow(
    request: RawRecordIndexWindowRequest,
    signal?: AbortSignal,
  ): Promise<RawRecordIndexWindow>;
  retryRead(): void;
};

const IDLE_SCHEMA: StateActionSchemaState = { schema: null, status: "idle" };
const EMPTY_ROWS: ReadonlyMap<string, StateActionRowState> = new Map();

const stateActionDemandContext = createDemandContextProvider<
  StateActionSchemaState,
  StateActionRowState,
  StateActionHandlers
>({
  displayName: "StateActionProvider",
  emptyValues: EMPTY_ROWS,
  idleInventory: IDLE_SCHEMA,
  missingProviderMessage:
    "episode state/action rows must be used inside <StateActionProvider>",
});

/**
 * Shares the playhead-synced exact state/action row with its tiles. The
 * provider holds state plus the interest registry; `StateActionBridge`
 * inside the shell owns the capability and services demand, so several
 * tiles share one resolution.
 */
export const StateActionProvider = stateActionDemandContext.Provider;

/** Whether a StateActionProvider is mounted above the calling component. */
export function useHasStateActionProvider(): boolean {
  return stateActionDemandContext.useOptionalDemandContext() !== null;
}

/** The published session schema, or null without a provider or session. */
export function useStateActionSchemaIfPresent(): StateActionSchema | null {
  const controller = stateActionDemandContext.useOptionalDemandContext();
  const inventory = controller?.inventory;
  return inventory?.status === "ready" ? inventory.schema : null;
}

/** Reads the state/action cache and demand hooks for the tile. */
export function useStateActionContext(): StateActionContextValue {
  const { ensureInventory, handlersRef, inventory, subscribeKey, valuesByKey } =
    useInternalValue();
  const subscribeRow = useCallback(() => subscribeKey(ROW_KEY), [subscribeKey]);
  const holdCursorRow = useCallback(
    (row: StateActionRow, echoNs: bigint) => {
      handlersRef.current?.holdCursorRow(row, echoNs);
    },
    [handlersRef],
  );
  const readRowAtCursor = useCallback(
    (cursor: RawRecordCursor, signal?: AbortSignal) => {
      const handlers = handlersRef.current;
      return handlers
        ? handlers.readRowAtCursor(cursor, signal)
        : Promise.reject(
            new Error("episode state/action reader is unavailable"),
          );
    },
    [handlersRef],
  );
  const readRowIndexWindow = useCallback(
    (request: RawRecordIndexWindowRequest, signal?: AbortSignal) => {
      const handlers = handlersRef.current;
      return handlers
        ? handlers.readRowIndexWindow(request, signal)
        : Promise.reject(
            new Error("episode state/action index is unavailable"),
          );
    },
    [handlersRef],
  );
  const readDimensionStats = useCallback(
    (signal?: AbortSignal) => {
      const handlers = handlersRef.current;
      return handlers
        ? handlers.readDimensionStats(signal)
        : Promise.resolve(null);
    },
    [handlersRef],
  );
  const readEpisodeProfile = useCallback(
    (signal?: AbortSignal) => {
      const handlers = handlersRef.current;
      return handlers
        ? handlers.readEpisodeProfile(signal)
        : Promise.resolve(null);
    },
    [handlersRef],
  );
  const retryRead = useCallback(() => {
    handlersRef.current?.retryRead();
  }, [handlersRef]);
  return useMemo(
    () => ({
      ensureSchema: ensureInventory,
      holdCursorRow,
      readDimensionStats,
      readEpisodeProfile,
      readRowAtCursor,
      readRowIndexWindow,
      retryRead,
      rowState: valuesByKey.get(ROW_KEY),
      schema: inventory,
      subscribeRow,
    }),
    [
      ensureInventory,
      holdCursorRow,
      inventory,
      readDimensionStats,
      readEpisodeProfile,
      readRowAtCursor,
      readRowIndexWindow,
      retryRead,
      subscribeRow,
      valuesByKey,
    ],
  );
}

/**
 * Bridge that services exact-row demand against the session capability.
 * Playhead following rides the throttled demand-bridge cadence and always
 * resolves the newest target; explicit paused seeks are expedited onto the
 * responsive inspection intent. A cursor-pinned row survives its own
 * paused-seek echo, so stepping never re-resolves through time.
 */
export function StateActionBridge({
  capability,
  sourceKey,
}: {
  readonly capability: StateActionCapability | null;
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
  // store; standalone callers and tests resolve at the timeline start.
  const playbackStore = useContext(PlaybackStoreContext);
  const dataStream = useDataStream();
  const dataStreamRef = useRef(dataStream);
  dataStreamRef.current = dataStream;

  // This effect owns one source epoch: the published row, demand handlers,
  // and the playhead-following loop. It re-keys (full reset) when the
  // source changes, before the browser paints the newly presented source.
  useLayoutEffect(() => {
    reset();
    if (!capability || !sourceKey) {
      return undefined;
    }

    const published = new Map<string, StateActionRowState>();
    let inflight: {
      readonly controller: AbortController;
      readonly expedited: boolean;
      readonly targetNs: bigint;
    } | null = null;
    let desiredTargetNs: bigint | null = null;
    let desiredExpedited = false;
    let held: { readonly echoNs: bigint; readonly row: StateActionRow } | null =
      null;
    let failureRetryToken: object | null = null;
    const failures = createDemandFailureBackoff<string>();
    const epochController = new AbortController();

    const stopBridge = startDemandBridge<
      StateActionHandlers,
      NonNullable<typeof dataStream>
    >({
      dataStreamRef,
      deferredRetryMs: DEFERRED_RETRY_MS,
      expeditePausedSeeks: true,
      handlersRef,
      inventoryReplay,
      makeHandlers: ({ isCancelled, queueExpeditedFill }) => {
        // Publish eagerly for the common mount order, and again through
        // ensureInventory: a shell remount runs the outgoing bridge's
        // passive reset after this layout-phase publish, and the tile's
        // ensureSchema effect is what restores the wiped schema.
        const publishSchema = () => {
          if (isCancelled()) return;
          setInventory({ schema: capability.schema, status: "ready" });
        };
        publishSchema();
        return {
          ensureInventory: publishSchema,
          holdCursorRow(row, echoNs) {
            if (isCancelled()) return;
            held = { echoNs, row };
            desiredTargetNs = echoNs;
            inflight?.controller.abort();
            inflight = null;
            published.set(ROW_KEY, {
              pinned: true,
              row,
              status: "ready",
              targetNs: echoNs,
            });
            publishValues(published, isCancelled);
          },
          onDemandChanged: queueExpeditedFill,
          async readDimensionStats(signal) {
            if (!capability.readDimensionStats) return null;
            const linked = linkAbortSignals(epochController.signal, signal);
            try {
              return await capability.readDimensionStats({
                signal: linked.signal,
              });
            } finally {
              linked.cleanup();
            }
          },
          async readEpisodeProfile(signal) {
            if (!capability.readEpisodeProfile) return null;
            const linked = linkAbortSignals(epochController.signal, signal);
            try {
              return await capability.readEpisodeProfile({
                signal: linked.signal,
              });
            } finally {
              linked.cleanup();
            }
          },
          async readRowAtCursor(cursor, signal) {
            const linked = linkAbortSignals(epochController.signal, signal);
            try {
              return await capability.readAtCursor({
                cursor,
                signal: linked.signal,
              });
            } finally {
              linked.cleanup();
            }
          },
          async readRowIndexWindow(request, signal) {
            const linked = linkAbortSignals(epochController.signal, signal);
            try {
              return await capability.readIndexWindow({
                ...request,
                signal: linked.signal,
              });
            } finally {
              linked.cleanup();
            }
          },
          retryRead() {
            failures.clear(ROW_KEY);
            queueExpeditedFill();
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
        if (!timeline) return;
        const demanded = new Set(demandKeys).has(ROW_KEY);
        if (!demanded) {
          inflight?.controller.abort();
          inflight = null;
          desiredTargetNs = null;
          desiredExpedited = false;
          held = null;
          failureRetryToken = null;
          return;
        }
        const playheadNs = timeline.secToNs(playheadSec);
        if (held) {
          // The pinned row already answers its own paused-seek echo. Any
          // other target is a real user movement and resumes time following.
          if (playheadNs === held.echoNs) return;
          held = null;
        }
        const previousTarget = desiredTargetNs;
        desiredTargetNs = playheadNs;
        desiredExpedited =
          expedited || (previousTarget === playheadNs && desiredExpedited);

        if (inflight) {
          // Only explicit paused intent supersedes in-flight work; during
          // playback the completion is validated against desiredTargetNs.
          if (
            expedited &&
            (!inflight.expedited || inflight.targetNs !== playheadNs)
          ) {
            inflight.controller.abort();
            inflight = null;
          } else {
            return;
          }
        }
        const state = published.get(ROW_KEY);
        if (
          state?.status === "ready" &&
          state.row?.timestampNs === playheadNs &&
          state.targetNs === playheadNs
        ) {
          return;
        }
        if (failures.isBlocked(ROW_KEY, nowMs(), userInitiated)) return;

        const controller = new AbortController();
        const readExpedited = desiredExpedited;
        inflight = {
          controller,
          expedited: readExpedited,
          targetNs: playheadNs,
        };
        if (state?.row === undefined || state.status === "error") {
          published.set(ROW_KEY, {
            ...(state?.row !== undefined ? { row: state.row } : {}),
            status: "loading",
            targetNs: playheadNs,
          });
          publishValues(published, isCancelled);
        } else {
          // Keep the committed row visible and mark it pending only when
          // the refetch is genuinely slow.
          later(() => {
            if (isCancelled() || inflight?.controller !== controller) return;
            const current = published.get(ROW_KEY);
            published.set(ROW_KEY, {
              ...(current?.row !== undefined ? { row: current.row } : {}),
              status: "loading",
              targetNs: playheadNs,
            });
            publishValues(published, isCancelled);
          }, PENDING_ROW_BADGE_MS);
        }
        void capability
          .readAtTime({
            intent: readExpedited ? "paused-inspection" : "background",
            signal: controller.signal,
            timestampNs: playheadNs,
          })
          .then((row) => {
            if (
              isCancelled() ||
              controller.signal.aborted ||
              inflight?.controller !== controller
            ) {
              return;
            }
            inflight = null;
            failures.clear(ROW_KEY);
            failureRetryToken = null;
            if (held || desiredTargetNs === null) return;
            if (desiredTargetNs !== playheadNs) {
              // Rapid seeks publish only the newest result: discard this
              // one and immediately admit the latest target.
              if (desiredExpedited) queueExpeditedFill();
              else queueImmediateFill();
              return;
            }
            published.set(ROW_KEY, {
              row,
              status: "ready",
              targetNs: playheadNs,
            });
            publishValues(published, isCancelled);
          })
          .catch((error: unknown) => {
            if (inflight?.controller === controller) {
              inflight = null;
            }
            if (isCancelled() || controller.signal.aborted) {
              return;
            }
            failures.record(ROW_KEY, nowMs());
            const previous = published.get(ROW_KEY);
            published.set(ROW_KEY, {
              error: errorMessage(error),
              ...(previous?.row !== undefined ? { row: previous.row } : {}),
              status: "error",
              ...(desiredTargetNs !== null
                ? { targetNs: desiredTargetNs }
                : {}),
            });
            publishValues(published, isCancelled);

            const retryToken = {};
            failureRetryToken = retryToken;
            later(() => {
              if (
                isCancelled() ||
                failureRetryToken !== retryToken ||
                desiredTargetNs === null
              ) {
                return;
              }
              failureRetryToken = null;
              if (desiredExpedited) queueExpeditedFill();
              else queueImmediateFill();
            }, DEMAND_FAILURE_BACKOFF_MS);
          });
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
      inflight?.controller.abort();
      inflight = null;
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
  return stateActionDemandContext.useDemandContext();
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
