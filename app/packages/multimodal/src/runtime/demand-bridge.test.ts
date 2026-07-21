import { createStore } from "jotai";
import { playheadAtom } from "@fiftyone/playback/runtime";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTimelineIndex } from "./timeline-index";
import {
  startDemandBridge,
  type DemandHandlers,
  type MutableRef,
  type TimelineDataStream,
} from "./demand-bridge";
import { useDemandRegistry } from "./react";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("demand bridge", () => {
  it("reference-counts demand subscriptions idempotently", () => {
    const onDemandChanged = vi.fn();
    const { result } = renderHook(() => useDemandRegistry<DemandHandlers>());
    act(() => {
      result.current.handlersRef.current = { onDemandChanged };
    });

    let unsubscribeFirst: () => void = () => undefined;
    let unsubscribeSecond: () => void = () => undefined;
    act(() => {
      unsubscribeFirst = result.current.subscribeKey("stream");
      unsubscribeSecond = result.current.subscribeKey("stream");
    });
    expect(result.current.refCountsRef.current.get("stream")).toBe(2);
    expect(onDemandChanged).toHaveBeenCalledTimes(2);

    act(unsubscribeFirst);
    expect(result.current.refCountsRef.current.get("stream")).toBe(1);
    expect(onDemandChanged).toHaveBeenCalledTimes(3);
    act(unsubscribeFirst);
    expect(result.current.refCountsRef.current.get("stream")).toBe(1);
    expect(onDemandChanged).toHaveBeenCalledTimes(3);

    act(unsubscribeSecond);
    expect(result.current.refCountsRef.current.has("stream")).toBe(false);
    expect(onDemandChanged).toHaveBeenCalledTimes(4);
  });

  it("coalesces immediate demand into one microtask fill", async () => {
    const harness = createHarness();
    harness.handlersRef.current?.onDemandChanged();
    harness.handlersRef.current?.onDemandChanged();

    await Promise.resolve();

    expect(harness.fills).toEqual([true]);
    harness.stop();
  });

  it("debounces demand changes", async () => {
    vi.useFakeTimers();
    const harness = createHarness({ demandDebounceMs: 20 });
    harness.handlersRef.current?.onDemandChanged();
    await vi.advanceTimersByTimeAsync(19);
    expect(harness.fills).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(harness.fills).toEqual([true]);
    harness.stop();
  });

  it("preserves user intent when an idle retry is already pending", async () => {
    vi.useFakeTimers();
    const playbackStore = createStore();
    let defer = false;
    const harness = createHarness({
      playbackStore,
      shouldDeferIdleWork: () => defer,
    });
    await Promise.resolve();
    expect(harness.fills).toEqual([true]);

    defer = true;
    playbackStore.set(playheadAtom, 1);
    harness.handlersRef.current?.onDemandChanged();
    await Promise.resolve();
    expect(harness.fills).toEqual([true]);

    defer = false;
    await vi.advanceTimersByTimeAsync(10);
    expect(harness.fills).toEqual([true, true]);
    harness.stop();
  });

  it("coalesces timeline retries and preserves user intent", async () => {
    vi.useFakeTimers();
    let timeline = null as ReturnType<typeof createTimelineIndex> | null;
    const dataStream: TimelineDataStream = {
      getTimelineIndex: () => timeline,
      sourceKey: "source",
    };
    const harness = createHarness({ dataStream, requireTimeline: true });
    await Promise.resolve();
    harness.handlersRef.current?.onDemandChanged();
    harness.handlersRef.current?.onDemandChanged();
    await Promise.resolve();

    timeline = createTimelineIndex({ endNs: 1_000_000_000n, startNs: 0n });
    await vi.advanceTimersByTimeAsync(10);

    expect(harness.fills).toEqual([true]);
    harness.stop();
  });

  it("throttles playhead fills and cancels pending work on teardown", async () => {
    vi.useFakeTimers();
    const playbackStore = createStore();
    let defer = false;
    const harness = createHarness({
      playbackStore,
      playheadThrottleMs: 100,
      shouldDeferIdleWork: () => defer,
    });
    await Promise.resolve();

    playbackStore.set(playheadAtom, 1);
    playbackStore.set(playheadAtom, 2);
    expect(harness.fills).toEqual([true, false]);

    defer = true;
    harness.handlersRef.current?.onDemandChanged();
    await Promise.resolve();
    harness.stop();
    defer = false;
    await vi.runAllTimersAsync();
    expect(harness.fills).toEqual([true, false]);
    expect(harness.handlersRef.current).toBeNull();
  });
});

interface HarnessOptions {
  readonly dataStream?: TimelineDataStream;
  readonly demandDebounceMs?: number;
  readonly playbackStore?: ReturnType<typeof createStore>;
  readonly playheadThrottleMs?: number;
  readonly requireTimeline?: boolean;
  readonly shouldDeferIdleWork?: () => boolean;
}

function createHarness(options: HarnessOptions = {}) {
  const fills: boolean[] = [];
  const handlersRef: MutableRef<DemandHandlers | null> = {
    current: null,
  };
  const dataStreamRef: MutableRef<TimelineDataStream | null> = {
    current:
      options.dataStream ??
      ({ getTimelineIndex: () => null, sourceKey: "source" } as const),
  };
  const stop = startDemandBridge({
    dataStreamRef,
    demandDebounceMs: options.demandDebounceMs,
    deferredRetryMs: 10,
    handlersRef,
    makeHandlers: ({ queueFill }) => ({ onDemandChanged: queueFill }),
    onFill: ({ userInitiated }) => fills.push(userInitiated),
    playbackStore: options.playbackStore ?? null,
    playheadThrottleMs: options.playheadThrottleMs ?? 0,
    refCountsRef: { current: new Map([["stream", 1]]) },
    requireTimeline: options.requireTimeline ?? false,
    shouldDeferIdleWork: options.shouldDeferIdleWork,
    timelineRetryMs: 10,
  });
  return { fills, handlersRef, stop };
}
