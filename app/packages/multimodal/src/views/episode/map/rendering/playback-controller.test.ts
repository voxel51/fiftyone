import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MapPlaybackController,
  type MapPlaybackScheduler,
} from "./playback-controller";

class ManualScheduler implements MapPlaybackScheduler {
  private frameId = 0;
  private readonly frames = new Map<number, (now: number) => void>();
  private timeMs = 0;
  private timerId = 0;
  private readonly timers = new Map<
    ReturnType<typeof setTimeout>,
    { callback: () => void; dueAt: number }
  >();

  cancelAnimationFrame(frame: number): void {
    this.frames.delete(frame);
  }

  clearTimeout(timer: ReturnType<typeof setTimeout>): void {
    this.timers.delete(timer);
  }

  now(): number {
    return this.timeMs;
  }

  requestAnimationFrame(callback: (now: number) => void): number {
    const frame = ++this.frameId;
    this.frames.set(frame, callback);
    return frame;
  }

  runAnimationFrame(timeMs: number): void {
    this.advanceTo(timeMs);
    const callbacks = [...this.frames.values()];
    this.frames.clear();
    for (const callback of callbacks) callback(timeMs);
  }

  setTimeout(
    callback: () => void,
    delayMs: number,
  ): ReturnType<typeof setTimeout> {
    const timer = ++this.timerId as unknown as ReturnType<typeof setTimeout>;
    this.timers.set(timer, { callback, dueAt: this.timeMs + delayMs });
    return timer;
  }

  setTime(timeMs: number): void {
    this.advanceTo(timeMs);
  }

  private advanceTo(timeMs: number): void {
    let next = [...this.timers.entries()]
      .filter(([, timer]) => timer.dueAt <= timeMs)
      .sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
    while (next) {
      const [id, timer] = next;
      this.timers.delete(id);
      this.timeMs = timer.dueAt;
      timer.callback();
      next = [...this.timers.entries()]
        .filter(([, timer]) => timer.dueAt <= timeMs)
        .sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
    }
    this.timeMs = timeMs;
  }
}

describe("MapPlaybackController", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid update rate of %s",
    (maxUpdatesPerSecond) => {
      expect(
        () =>
          new MapPlaybackController({
            maxUpdatesPerSecond,
            onPaint: () => undefined,
            scheduler: new ManualScheduler(),
          }),
      ).toThrow("maxUpdatesPerSecond must be a positive finite number");
    },
  );

  it("coalesces notifications and caps paints", () => {
    const scheduler = new ManualScheduler();
    const paints: Array<{ nowMs: number; playheadNs: bigint | null }> = [];
    const controller = new MapPlaybackController({
      maxUpdatesPerSecond: 30,
      onPaint: (playheadNs, nowMs) => paints.push({ nowMs, playheadNs }),
      scheduler,
    });

    controller.updatePlayhead(0n);
    scheduler.runAnimationFrame(0);
    scheduler.setTime(5);
    controller.updatePlayhead(1n);
    scheduler.setTime(10);
    controller.updatePlayhead(2n);
    scheduler.runAnimationFrame(34);

    expect(paints).toEqual([
      { nowMs: 0, playheadNs: 0n },
      { nowMs: 34, playheadNs: 2n },
    ]);
  });

  it("retains only the latest hidden playhead and flushes once on resume", () => {
    const scheduler = new ManualScheduler();
    const paints: Array<bigint | null> = [];
    const controller = new MapPlaybackController({
      onPaint: (playheadNs) => paints.push(playheadNs),
      scheduler,
    });

    controller.setSurfaceActive(false);
    controller.updatePlayhead(1n);
    controller.updatePlayhead(2n);
    scheduler.setTime(100);
    controller.setSurfaceActive(true);

    expect(paints).toEqual([2n]);
  });

  it("does not paint when visibility toggles without pending work", () => {
    const scheduler = new ManualScheduler();
    const paints: Array<bigint | null> = [];
    const controller = new MapPlaybackController({
      onPaint: (playheadNs) => paints.push(playheadNs),
      scheduler,
    });

    controller.setSurfaceActive(false);
    controller.setSurfaceActive(true);

    expect(paints).toEqual([]);
  });

  it("does not flush an already-painted value", () => {
    const scheduler = new ManualScheduler();
    const paints: Array<bigint | null> = [];
    const controller = new MapPlaybackController({
      onPaint: (playheadNs) => paints.push(playheadNs),
      scheduler,
    });

    controller.updatePlayhead(1n, true);
    controller.flushLatest();

    expect(paints).toEqual([1n]);
  });

  it("repaints invalidated static data once after a hidden interval", () => {
    const scheduler = new ManualScheduler();
    const paints: Array<bigint | null> = [];
    const controller = new MapPlaybackController({
      onPaint: (playheadNs) => paints.push(playheadNs),
      scheduler,
    });

    controller.updatePlayhead(2n, true);
    controller.setSurfaceActive(false);
    controller.invalidate();
    controller.setSurfaceActive(true);

    expect(paints).toEqual([2n, 2n]);
  });

  it("repaints an active invalidation immediately", () => {
    const scheduler = new ManualScheduler();
    const paints: Array<{ nowMs: number; playheadNs: bigint | null }> = [];
    const controller = new MapPlaybackController({
      onPaint: (playheadNs, nowMs) => paints.push({ nowMs, playheadNs }),
      scheduler,
    });

    controller.updatePlayhead(2n, true);
    scheduler.setTime(5);
    controller.invalidate();

    expect(paints).toEqual([
      { nowMs: 0, playheadNs: 2n },
      { nowMs: 5, playheadNs: 2n },
    ]);
  });

  it("lets paused seeks bypass the ordinary cadence", () => {
    const scheduler = new ManualScheduler();
    const paints: Array<{ nowMs: number; playheadNs: bigint | null }> = [];
    const controller = new MapPlaybackController({
      onPaint: (playheadNs, nowMs) => paints.push({ nowMs, playheadNs }),
      scheduler,
    });

    controller.updatePlayhead(0n);
    scheduler.runAnimationFrame(0);
    scheduler.setTime(5);
    controller.updatePlayhead(1n);
    scheduler.setTime(6);
    controller.updatePlayhead(9n, true);
    scheduler.runAnimationFrame(40);

    expect(paints).toEqual([
      { nowMs: 0, playheadNs: 0n },
      { nowMs: 6, playheadNs: 9n },
    ]);
  });

  it("cancels pending work and ignores updates after disposal", () => {
    const scheduler = new ManualScheduler();
    const paints: Array<bigint | null> = [];
    const controller = new MapPlaybackController({
      onPaint: (playheadNs) => paints.push(playheadNs),
      scheduler,
    });

    controller.updatePlayhead(1n);
    controller.dispose();
    scheduler.runAnimationFrame(100);
    controller.updatePlayhead(2n, true);
    controller.invalidate();
    controller.setSurfaceActive(false);
    controller.setSurfaceActive(true);
    controller.flushLatest();

    expect(paints).toEqual([]);
  });

  it("contains paint failures and recovers on the next update", () => {
    const scheduler = new ManualScheduler();
    const paints: Array<bigint | null> = [];
    const failure = new Error("source is temporarily unavailable");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const controller = new MapPlaybackController({
      onPaint: (playheadNs) => {
        if (playheadNs === 1n) throw failure;
        paints.push(playheadNs);
      },
      scheduler,
    });

    expect(() => controller.updatePlayhead(1n, true)).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to paint the episode map playback frame",
      failure,
    );

    controller.updatePlayhead(2n, true);
    expect(paints).toEqual([2n]);
  });
});
