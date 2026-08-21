import { createStore } from "jotai";
import {
  isPlayPendingAtom,
  isPlayingAtom,
  playheadAtom,
  seekEventAtom,
} from "@fiftyone/playback/runtime";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTimelineIndex } from "./timeline-index";
import {
  createDemandFailureBackoff,
  createDemandInventoryMachine,
  publishDemandMapSnapshot,
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

  it("bypasses throttle and idle stand-down only for explicit paused seeks", async () => {
    vi.useFakeTimers();
    const playbackStore = createStore();
    const fills: Array<{ expedited: boolean; playheadSec: number }> = [];
    const harness = createHarness({
      expeditePausedSeeks: true,
      onFill: ({ expedited, playheadSec }) =>
        fills.push({ expedited, playheadSec }),
      playbackStore,
      playheadThrottleMs: 300,
      shouldDeferIdleWork: () => true,
    });

    playbackStore.set(playheadAtom, 1);
    playbackStore.set(seekEventAtom, { seq: 1, time: 1 });
    await Promise.resolve();
    expect(fills).toEqual([{ expedited: true, playheadSec: 1 }]);

    playbackStore.set(isPlayingAtom, true);
    playbackStore.set(playheadAtom, 2);
    playbackStore.set(seekEventAtom, { seq: 2, time: 2 });
    await Promise.resolve();
    expect(fills).toHaveLength(1);

    playbackStore.set(isPlayingAtom, false);
    playbackStore.set(isPlayPendingAtom, true);
    playbackStore.set(playheadAtom, 3);
    playbackStore.set(seekEventAtom, { seq: 3, time: 3 });
    await Promise.resolve();
    expect(fills).toHaveLength(1);
    harness.stop();
  });

  it("downgrades paused seek intent when playback starts before its microtask", async () => {
    vi.useFakeTimers();
    const playbackStore = createStore();
    let defer = false;
    const fills: Array<{ expedited: boolean; userInitiated: boolean }> = [];
    const harness = createHarness({
      expeditePausedSeeks: true,
      onFill: ({ expedited, userInitiated }) =>
        fills.push({ expedited, userInitiated }),
      playbackStore,
      shouldDeferIdleWork: () => defer,
    });
    await Promise.resolve();
    fills.length = 0;

    defer = true;
    playbackStore.set(seekEventAtom, { seq: 1, time: 1 });
    playbackStore.set(isPlayingAtom, true);
    await Promise.resolve();

    expect(fills).toEqual([]);
    playbackStore.set(isPlayingAtom, false);
    defer = false;
    await vi.advanceTimersByTimeAsync(10);
    expect(fills).toEqual([{ expedited: false, userInitiated: false }]);
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

  it("services the final playhead after coalescing rapid updates", async () => {
    vi.useFakeTimers();
    const playbackStore = createStore();
    const playheads: number[] = [];
    const harness = createHarness({
      onFill: ({ playheadSec }) => playheads.push(playheadSec),
      playbackStore,
      playheadThrottleMs: 100,
    });
    await Promise.resolve();

    playbackStore.set(playheadAtom, 1);
    playbackStore.set(playheadAtom, 2);
    playbackStore.set(playheadAtom, 3);
    expect(playheads).toEqual([0, 1]);

    await vi.advanceTimersByTimeAsync(100);
    expect(playheads).toEqual([0, 1, 3]);
    harness.stop();
  });

  it("replays provider inventory demand when handlers become ready", () => {
    interface InventoryHandlers extends DemandHandlers {
      ensureInventory(): void;
    }
    const ensureInventory = vi.fn();
    const handlersRef: MutableRef<InventoryHandlers | null> = { current: null };
    const stop = startDemandBridge({
      dataStreamRef: {
        current: { getTimelineIndex: () => null, sourceKey: "source" },
      },
      deferredRetryMs: 10,
      handlersRef,
      inventoryReplay: {
        ensure: (handlers) => handlers.ensureInventory(),
        wantedRef: { current: true },
      },
      makeHandlers: ({ queueFill }) => ({
        ensureInventory,
        onDemandChanged: queueFill,
      }),
      onFill: vi.fn(),
      playbackStore: null,
      playheadThrottleMs: 0,
      refCountsRef: { current: new Map() },
      requireTimeline: false,
      timelineRetryMs: 10,
    });

    expect(ensureInventory).toHaveBeenCalledOnce();
    stop();
  });

  it("resets the one-shot inventory gate after an error", async () => {
    const states: string[] = [];
    const load = vi
      .fn<(publish: (state: string) => void) => Promise<void>>()
      .mockRejectedValueOnce(new Error("failed"))
      .mockImplementationOnce(async (publish) => publish("ready"));
    const machine = createDemandInventoryMachine({
      error: "error",
      isCancelled: () => false,
      load,
      loading: "loading",
      publish: (state) => states.push(state),
    });

    machine.ensure();
    machine.ensure();
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledOnce();
    expect(states).toEqual(["loading", "error"]);

    machine.ensure();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);
    expect(states).toEqual(["loading", "error", "loading", "ready"]);
  });

  it("backs off passive retries while allowing user demand", () => {
    const failures = createDemandFailureBackoff<string>();
    failures.record("stream", 1_000);

    expect(failures.isBlocked("stream", 2_000, false)).toBe(true);
    expect(failures.isBlocked("stream", 2_000, true)).toBe(false);
    expect(failures.isBlocked("stream", 6_000, false)).toBe(false);
    failures.clear("stream");
    expect(failures.isBlocked("stream", 1_001, false)).toBe(false);
  });

  it("publishes immutable snapshots only for a live epoch", () => {
    const published: ReadonlyMap<string, number>[] = [];
    const source = new Map([["stream", 1]]);
    publishDemandMapSnapshot(
      source,
      (value) => published.push(value),
      () => false,
    );
    source.set("stream", 2);
    publishDemandMapSnapshot(
      source,
      (value) => published.push(value),
      () => true,
    );

    expect(published).toHaveLength(1);
    expect(published[0].get("stream")).toBe(1);
  });
});

interface HarnessOptions {
  readonly dataStream?: TimelineDataStream;
  readonly demandDebounceMs?: number;
  readonly expeditePausedSeeks?: boolean;
  readonly onFill?: Parameters<typeof startDemandBridge>[0]["onFill"];
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
    expeditePausedSeeks: options.expeditePausedSeeks,
    handlersRef,
    makeHandlers: ({ queueFill }) => ({ onDemandChanged: queueFill }),
    onFill:
      options.onFill ?? (({ userInitiated }) => fills.push(userInitiated)),
    playbackStore: options.playbackStore ?? null,
    playheadThrottleMs: options.playheadThrottleMs ?? 0,
    refCountsRef: { current: new Map([["stream", 1]]) },
    requireTimeline: options.requireTimeline ?? false,
    shouldDeferIdleWork: options.shouldDeferIdleWork,
    timelineRetryMs: 10,
  });
  return { fills, handlersRef, stop };
}
