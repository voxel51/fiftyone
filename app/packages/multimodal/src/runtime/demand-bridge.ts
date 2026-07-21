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
}

/** Fill context for one queued or playhead-driven demand pass. */
export interface DemandBridgeFillContext extends DemandBridgeRuntime {
  readonly demandKeys: Iterable<string>;
  readonly playheadSec: number;
  readonly timeline: TimelineIndex | null;
  readonly userInitiated: boolean;
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
  const runtime: DemandBridgeRuntime = {
    isCancelled,
    later,
    nowMs,
    queueFill,
  };
  const handlers = makeHandlers(runtime);
  handlersRef.current = handlers;
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
