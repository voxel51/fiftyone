import { describe, expect, it, vi } from "vitest";
import {
  createPlotPublicationStore,
  type PlotPublicationFrameScheduler,
} from "./plot-publication-store";

describe("plot publication store", () => {
  it("publishes a changed key without notifying other keys", () => {
    const frames = createFrameScheduler();
    const store = createPlotPublicationStore<string, number>({
      scheduleFrame: frames.schedule,
    });
    const onA = vi.fn();
    const onB = vi.fn();
    store.subscribe("a", onA);
    store.subscribe("b", onB);

    store.set("a", 1);
    expect(store.getSnapshot("a")).toBeUndefined();
    frames.flush();

    expect(store.getSnapshot("a")).toBe(1);
    expect(onA).toHaveBeenCalledOnce();
    expect(onB).not.toHaveBeenCalled();
  });

  it("coalesces bursts and publishes only the latest value once per frame", () => {
    const frames = createFrameScheduler();
    const store = createPlotPublicationStore<string, number>({
      scheduleFrame: frames.schedule,
    });
    const listener = vi.fn();
    store.subscribe("signal", listener);

    store.set("signal", 1);
    store.set("signal", 2);
    store.set("signal", 3);

    expect(frames.pending()).toBe(1);
    frames.flush();
    expect(store.getSnapshot("signal")).toBe(3);
    expect(listener).toHaveBeenCalledOnce();

    store.set("signal", 3);
    frames.flush();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("publishes deletes by key and resets all committed values", () => {
    const frames = createFrameScheduler();
    const store = createPlotPublicationStore<string, number>({
      scheduleFrame: frames.schedule,
    });
    store.set("a", 1);
    store.set("b", 2);
    frames.flush();
    const onA = vi.fn();
    const onB = vi.fn();
    store.subscribe("a", onA);
    store.subscribe("b", onB);

    store.delete("a");
    frames.flush();
    expect(store.getSnapshot("a")).toBeUndefined();
    expect(store.getSnapshot("b")).toBe(2);
    expect(onA).toHaveBeenCalledOnce();
    expect(onB).not.toHaveBeenCalled();

    store.reset();
    expect(store.getSnapshot("b")).toBeUndefined();
    expect(onA).toHaveBeenCalledOnce();
    expect(onB).toHaveBeenCalledOnce();
  });

  it("suppresses cancelled and reset source-epoch frames", () => {
    const frames = createFrameScheduler();
    const store = createPlotPublicationStore<string, number>({
      scheduleFrame: frames.schedule,
    });
    const listener = vi.fn();
    store.subscribe("signal", listener);

    const cancelled = store.beginSourceEpoch();
    cancelled.set("signal", 1);
    cancelled.cancel();
    frames.flushCancelled();
    expect(store.getSnapshot("signal")).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();

    const reset = store.beginSourceEpoch();
    reset.set("signal", 2);
    store.reset();
    frames.flushCancelled();
    reset.set("signal", 3);
    expect(frames.pending()).toBe(0);
    expect(store.getSnapshot("signal")).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });
});

function createFrameScheduler() {
  interface Frame {
    readonly callback: () => void;
    cancelled: boolean;
  }
  const frames: Frame[] = [];
  const schedule: PlotPublicationFrameScheduler = (callback) => {
    const frame: Frame = { callback, cancelled: false };
    frames.push(frame);
    return () => {
      frame.cancelled = true;
    };
  };
  return {
    flush() {
      const pending = frames.splice(0);
      for (const frame of pending) {
        if (!frame.cancelled) frame.callback();
      }
    },
    flushCancelled() {
      const pending = frames.splice(0);
      for (const frame of pending) frame.callback();
    },
    pending: () => frames.filter((frame) => !frame.cancelled).length,
    schedule,
  };
}
