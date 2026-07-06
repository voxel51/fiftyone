import {
  getPlayhead,
  subscribePlayhead,
} from "@fiftyone/playback/src/lib/playback/store-access";
import type { PlaybackStore } from "@fiftyone/playback/src/lib/playback/types";
import { useCallback, useRef, type MutableRefObject } from "react";
import type { McapDataStream } from "./mcap-data-stream-context";
import { shouldDeferMcapIdleWorkForStore } from "./mcap-network-health";
import type { McapTimelineIndex } from "./mcap-timeline-index";

/**
 * Handler surface a provider exposes to the bridge that currently owns
 * the active source.
 */
export interface McapDemandHandlers {
  onDemandChanged(): void;
}

/**
 * Refcounted demand registry shared by MCAP context providers whose
 * consumers subscribe to source-scoped resource keys.
 */
export interface McapDemandRegistry<THandlers extends McapDemandHandlers> {
  readonly handlersRef: MutableRefObject<THandlers | null>;
  readonly refCountsRef: MutableRefObject<Map<string, number>>;
  readonly subscribeKey: (key: string) => () => void;
}

/**
 * Creates stable demand refs plus an idempotent key subscription helper.
 * The active bridge receives demand-change notifications through
 * `handlersRef` and drains any demand that arrived before it mounted.
 */
export function useMcapDemandRegistry<
  THandlers extends McapDemandHandlers,
>(): McapDemandRegistry<THandlers> {
  const handlersRef = useRef<THandlers | null>(null);
  const refCountsRef = useRef(new Map<string, number>());

  const subscribeKey = useCallback((key: string) => {
    const counts = refCountsRef.current;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    handlersRef.current?.onDemandChanged();
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const current = counts.get(key) ?? 0;
      if (current <= 1) {
        counts.delete(key);
      } else {
        counts.set(key, current - 1);
      }
    };
  }, []);

  return { handlersRef, refCountsRef, subscribeKey };
}

/**
 * Runtime utilities passed into a source-scoped demand bridge epoch.
 */
export interface McapDemandBridgeRuntime {
  readonly isCancelled: () => boolean;
  readonly later: (callback: () => void, ms: number) => void;
  readonly nowMs: () => number;
  readonly queueFill: () => void;
}

/**
 * Fill callback context for one queued or playhead-driven demand pass.
 */
export interface McapDemandBridgeFillContext extends McapDemandBridgeRuntime {
  readonly demandKeys: Iterable<string>;
  readonly playheadSec: number;
  readonly timeline: McapTimelineIndex | null;
  readonly userInitiated: boolean;
}

/**
 * Configuration for the shared demand-bridge lifecycle. Domain bridges
 * provide the actual fetch/cache behavior through `onFill`.
 */
export interface McapDemandBridgeOptions<THandlers extends McapDemandHandlers> {
  readonly dataStreamRef: MutableRefObject<McapDataStream | null>;
  readonly deferredRetryMs: number;
  readonly handlersRef: MutableRefObject<THandlers | null>;
  readonly makeHandlers: (runtime: McapDemandBridgeRuntime) => THandlers;
  readonly onFill: (context: McapDemandBridgeFillContext) => void;
  readonly onHandlersReady?: (handlers: THandlers) => void;
  readonly playbackStore: PlaybackStore | null;
  readonly playheadThrottleMs: number;
  readonly refCountsRef: MutableRefObject<Map<string, number>>;
  readonly requireTimeline: boolean;
  readonly timelineRetryMs: number;
}

/**
 * Starts one active-source demand bridge epoch and returns its teardown.
 * The shared lifecycle owns microtask coalescing, idle-network deferral,
 * timeline readiness retries, playhead throttling, and timeout cleanup.
 */
export function startMcapDemandBridge<THandlers extends McapDemandHandlers>({
  dataStreamRef,
  deferredRetryMs,
  handlersRef,
  makeHandlers,
  onFill,
  onHandlersReady,
  playbackStore,
  playheadThrottleMs,
  refCountsRef,
  requireTimeline,
  timelineRetryMs,
}: McapDemandBridgeOptions<THandlers>): () => void {
  let cancelled = false;
  let fillQueued = false;
  let deferPending = false;
  let lastPlayheadFillMs = Number.NEGATIVE_INFINITY;
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
    if (cancelled || refCountsRef.current.size === 0) {
      return;
    }

    if (playbackStore && shouldDeferMcapIdleWorkForStore(playbackStore, null)) {
      if (!deferPending) {
        deferPending = true;
        later(() => {
          deferPending = false;
          fill(userInitiated);
        }, deferredRetryMs);
      }
      return;
    }

    const timeline = dataStreamRef.current?.getTimelineIndex() ?? null;
    if (requireTimeline && !timeline) {
      later(() => fill(userInitiated), timelineRetryMs);
      return;
    }

    onFill({
      demandKeys: refCountsRef.current.keys(),
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
    if (fillQueued || cancelled) {
      return;
    }
    fillQueued = true;
    queueMicrotask(() => {
      fillQueued = false;
      fill(true);
    });
  };

  const runtime: McapDemandBridgeRuntime = {
    isCancelled,
    later,
    nowMs,
    queueFill,
  };
  const handlers = makeHandlers(runtime);
  handlersRef.current = handlers;
  onHandlersReady?.(handlers);

  // Drain interest registered before this bridge (or source) mounted.
  queueFill();

  const unsubscribePlayhead = playbackStore
    ? subscribePlayhead(playbackStore, () => {
        const now = nowMs();
        if (now - lastPlayheadFillMs < playheadThrottleMs) {
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
}

/**
 * Current timestamp for bridge throttles and retry backoffs.
 */
export function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
