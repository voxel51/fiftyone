import {
  getPlayhead,
  subscribePlayhead,
  type PlaybackStore,
} from "@fiftyone/playback/runtime";
import { monotonicNowMs } from "../utils/monotonic-time";
import type { TimelineIndex } from "./timeline-index";

/** Minimal mutable reference contract shared with React and headless callers. */
export interface MutableRef<T> {
  current: T;
}

/** Minimum data-stream surface needed by the runtime demand bridge. */
export interface TimelineDataStream {
  readonly sourceKey: string;
  readonly getTimelineIndex: () => TimelineIndex | null;
}

/** Handler surface a provider exposes to the active-source demand bridge. */
export interface DemandHandlers {
  onDemandChanged(): void;
}

/** Default stand-down after a failed demand read. */
export const DEMAND_FAILURE_BACKOFF_MS = 5_000;

/** Refcounted demand registry shared by source-scoped runtime providers. */
export interface DemandRegistry<THandlers extends DemandHandlers> {
  readonly handlersRef: MutableRef<THandlers | null>;
  readonly refCountsRef: MutableRef<Map<string, number>>;
  readonly subscribeKey: (key: string) => () => void;
}

/** Runtime utilities passed into one source-scoped bridge epoch. */
export interface DemandBridgeRuntime {
  readonly isCancelled: () => boolean;
  readonly later: (callback: () => void, ms: number) => void;
  readonly nowMs: () => number;
  readonly queueFill: () => void;
  readonly queueImmediateFill: () => void;
}

/** Fill context for one queued or playhead-driven demand pass. */
export interface DemandBridgeFillContext extends DemandBridgeRuntime {
  readonly demandKeys: Iterable<string>;
  readonly playheadSec: number;
  readonly timeline: TimelineIndex | null;
  readonly userInitiated: boolean;
}

/** Replays provider-owned inventory demand when a bridge epoch becomes ready. */
export interface DemandInventoryReplay<THandlers extends DemandHandlers> {
  readonly ensure: (handlers: THandlers) => void;
  readonly wantedRef: MutableRef<boolean>;
}

/** Configuration for the shared demand-bridge lifecycle. */
export interface DemandBridgeOptions<
  THandlers extends DemandHandlers,
  TDataStream extends TimelineDataStream = TimelineDataStream,
> {
  readonly dataStreamRef: MutableRef<TDataStream | null>;
  readonly demandDebounceMs?: number;
  readonly deferredRetryMs: number;
  readonly handlersRef: MutableRef<THandlers | null>;
  readonly inventoryReplay?: DemandInventoryReplay<THandlers>;
  readonly makeHandlers: (runtime: DemandBridgeRuntime) => THandlers;
  readonly onFill: (context: DemandBridgeFillContext) => void;
  readonly onHandlersReady?: (handlers: THandlers) => void;
  readonly playbackStore: PlaybackStore | null;
  readonly playheadThrottleMs: number;
  readonly refCountsRef: MutableRef<Map<string, number>>;
  readonly requireTimeline: boolean;
  readonly shouldDeferIdleWork?: (store: PlaybackStore) => boolean;
  readonly timelineRetryMs: number;
}

/** Starts one active-source demand bridge epoch and returns its teardown. */
export function startDemandBridge<
  THandlers extends DemandHandlers,
  TDataStream extends TimelineDataStream,
>({
  dataStreamRef,
  demandDebounceMs = 0,
  deferredRetryMs,
  handlersRef,
  inventoryReplay,
  makeHandlers,
  onFill,
  onHandlersReady,
  playbackStore,
  playheadThrottleMs,
  refCountsRef,
  requireTimeline,
  shouldDeferIdleWork,
  timelineRetryMs,
}: DemandBridgeOptions<THandlers, TDataStream>): () => void {
  let cancelled = false;
  let fillQueued = false;
  let demandFillTimeout: ReturnType<typeof setTimeout> | undefined;
  let deferPending = false;
  let deferredUserInitiated = false;
  let lastPlayheadFillMs = Number.NEGATIVE_INFINITY;
  let timelineRetryPending = false;
  let timelineRetryUserInitiated = false;
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const isCancelled = () => cancelled;
  const later = (callback: () => void, ms: number) => {
    const timeout = setTimeout(() => {
      timeouts.delete(timeout);
      callback();
    }, ms);
    timeouts.add(timeout);
  };
  const fill = (userInitiated: boolean) => {
    if (cancelled || refCountsRef.current.size === 0) return;
    if (playbackStore && shouldDeferIdleWork?.(playbackStore)) {
      deferredUserInitiated ||= userInitiated;
      if (!deferPending) {
        deferPending = true;
        later(() => {
          deferPending = false;
          const retryIsUserInitiated = deferredUserInitiated;
          deferredUserInitiated = false;
          fill(retryIsUserInitiated);
        }, deferredRetryMs);
      }
      return;
    }
    const timeline = dataStreamRef.current?.getTimelineIndex() ?? null;
    if (requireTimeline && !timeline) {
      timelineRetryUserInitiated ||= userInitiated;
      if (!timelineRetryPending) {
        timelineRetryPending = true;
        later(() => {
          timelineRetryPending = false;
          const retryIsUserInitiated = timelineRetryUserInitiated;
          timelineRetryUserInitiated = false;
          fill(retryIsUserInitiated);
        }, timelineRetryMs);
      }
      return;
    }
    onFill({
      demandKeys: [...refCountsRef.current.keys()],
      isCancelled,
      later,
      nowMs,
      playheadSec: playbackStore ? getPlayhead(playbackStore) : 0,
      queueFill,
      queueImmediateFill,
      timeline,
      userInitiated,
    });
  };
  const queueFill = () => {
    if (cancelled) return;
    if (demandDebounceMs > 0) {
      if (demandFillTimeout !== undefined) {
        clearTimeout(demandFillTimeout);
        timeouts.delete(demandFillTimeout);
      }
      const timeout = setTimeout(() => {
        timeouts.delete(timeout);
        if (demandFillTimeout === timeout) demandFillTimeout = undefined;
        fill(true);
      }, demandDebounceMs);
      demandFillTimeout = timeout;
      timeouts.add(timeout);
      return;
    }
    if (fillQueued) return;
    fillQueued = true;
    queueMicrotask(() => {
      fillQueued = false;
      fill(true);
    });
  };
  const queueImmediateFill = () => {
    if (cancelled || fillQueued) return;
    if (demandFillTimeout !== undefined) {
      clearTimeout(demandFillTimeout);
      timeouts.delete(demandFillTimeout);
      demandFillTimeout = undefined;
    }
    fillQueued = true;
    queueMicrotask(() => {
      fillQueued = false;
      fill(false);
    });
  };
  const runtime: DemandBridgeRuntime = {
    isCancelled,
    later,
    nowMs,
    queueFill,
    queueImmediateFill,
  };
  const handlers = makeHandlers(runtime);
  handlersRef.current = handlers;
  if (inventoryReplay?.wantedRef.current) {
    inventoryReplay.ensure(handlers);
  }
  onHandlersReady?.(handlers);
  queueFill();
  const unsubscribePlayhead = playbackStore
    ? subscribePlayhead(playbackStore, () => {
        const now = nowMs();
        if (now - lastPlayheadFillMs < playheadThrottleMs) return;
        lastPlayheadFillMs = now;
        fill(false);
      })
    : undefined;
  return () => {
    cancelled = true;
    demandFillTimeout = undefined;
    unsubscribePlayhead?.();
    for (const timeout of timeouts) clearTimeout(timeout);
    if (handlersRef.current === handlers) handlersRef.current = null;
  };
}

/** Current monotonic timestamp for bridge throttles and retries. */
export function nowMs(): number {
  return monotonicNowMs();
}

/** One-shot inventory lifecycle with retry-after-error semantics. */
export interface DemandInventoryMachine {
  ensure(): void;
}

/** Configuration for a source-epoch inventory machine. */
export interface DemandInventoryMachineOptions<State> {
  readonly error: State;
  readonly isCancelled: () => boolean;
  readonly load: (publish: (state: State) => void) => Promise<void>;
  readonly loading: State;
  readonly publish: (state: State) => void;
}

/** Creates a lazy one-shot inventory reader whose error state is retryable. */
export function createDemandInventoryMachine<State>({
  error,
  isCancelled,
  load,
  loading,
  publish,
}: DemandInventoryMachineOptions<State>): DemandInventoryMachine {
  let requested = false;
  const publishIfActive = (state: State) => {
    if (!isCancelled()) publish(state);
  };
  return {
    ensure() {
      if (isCancelled() || requested) return;
      requested = true;
      publish(loading);
      void load(publishIfActive).catch(() => {
        if (isCancelled()) return;
        requested = false;
        publish(error);
      });
    },
  };
}

/** Failure timestamps and user-initiated bypass for one demand epoch. */
export interface DemandFailureBackoff<Key> {
  clear(key: Key): void;
  isBlocked(key: Key, nowMs: number, userInitiated: boolean): boolean;
  record(key: Key, nowMs: number): void;
}

/** Creates a source-local failed-demand backoff ledger. */
export function createDemandFailureBackoff<Key>(
  backoffMs = DEMAND_FAILURE_BACKOFF_MS,
): DemandFailureBackoff<Key> {
  const failedAtMs = new Map<Key, number>();
  return {
    clear: (key) => failedAtMs.delete(key),
    isBlocked: (key, currentMs, userInitiated) => {
      if (userInitiated) return false;
      const failedMs = failedAtMs.get(key);
      return failedMs !== undefined && currentMs - failedMs < backoffMs;
    },
    record: (key, currentMs) => failedAtMs.set(key, currentMs),
  };
}

/** Publishes an immutable map snapshot unless its bridge epoch was cancelled. */
export function publishDemandMapSnapshot<Key, Value>(
  source: ReadonlyMap<Key, Value>,
  publish: (snapshot: ReadonlyMap<Key, Value>) => void,
  isCancelled: () => boolean,
): void {
  if (!isCancelled()) publish(new Map(source));
}
