import { describe, expect, it, vi } from "vitest";

import { VideoSeekAdmissionScheduler } from "./admission-scheduler";
import { VideoIntentCancelledError, VideoSchedulerClosedError } from "./types";

describe("VideoSeekAdmissionScheduler", () => {
  it.each([0, -1, 1.5, Number.NaN])(
    "rejects invalid historical capacity %s",
    (capacity) => {
      expect(() => new VideoSeekAdmissionScheduler(capacity)).toThrow(
        "capacity must be a positive safe integer",
      );
    },
  );

  it("prioritizes playing work while aging background work fairly", async () => {
    let now = 0;
    const scheduler = new VideoSeekAdmissionScheduler(1, () => now);
    const active = await scheduler.acquire(
      "visible",
      new AbortController().signal,
    );
    const order: string[] = [];
    const background = scheduler
      .acquire("background", new AbortController().signal)
      .then((release) => {
        order.push("background");
        return release;
      });
    const playing = scheduler
      .acquire("playing", new AbortController().signal)
      .then((release) => {
        order.push("playing");
        return release;
      });

    active();
    const releasePlaying = await playing;
    expect(order).toEqual(["playing"]);
    now = 5_000;
    const visible = scheduler
      .acquire("visible", new AbortController().signal)
      .then((release) => {
        order.push("visible");
        return release;
      });
    releasePlaying();
    const releaseBackground = await background;
    expect(order).toEqual(["playing", "background"]);
    releaseBackground();
    (await visible)();
    expect(order).toEqual(["playing", "background", "visible"]);
    scheduler.close();
  });

  it("removes a cancelled waiter without consuming capacity", async () => {
    const scheduler = new VideoSeekAdmissionScheduler(1);
    const active = await scheduler.acquire(
      "visible",
      new AbortController().signal,
    );
    const controller = new AbortController();
    const waiting = scheduler.acquire("visible", controller.signal);
    controller.abort();
    await expect(waiting).rejects.toBeInstanceOf(VideoIntentCancelledError);
    expect(scheduler.waitingCount).toBe(0);
    active();
    expect(scheduler.activeCount).toBe(0);
    scheduler.close();
  });

  it("promotes queued work without losing its age or sequence", async () => {
    const scheduler = new VideoSeekAdmissionScheduler(1);
    const active = await scheduler.acquire(
      "visible",
      new AbortController().signal,
    );
    const promotedController = new AbortController();
    const order: string[] = [];
    const promoted = scheduler
      .acquire("background", promotedController.signal)
      .then((release) => {
        order.push("promoted");
        return release;
      });
    const visible = scheduler
      .acquire("visible", new AbortController().signal)
      .then((release) => {
        order.push("visible");
        return release;
      });

    scheduler.promote(promotedController.signal, "playing");
    active();
    const releasePromoted = await promoted;
    expect(order).toEqual(["promoted"]);
    releasePromoted();
    (await visible)();
    expect(order).toEqual(["promoted", "visible"]);
    scheduler.close();
  });

  it("rejects pending and future work with a typed shutdown error", async () => {
    const scheduler = new VideoSeekAdmissionScheduler(1);
    const active = await scheduler.acquire(
      "visible",
      new AbortController().signal,
    );
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const waiting = scheduler.acquire("visible", controller.signal);
    const waitingRejection = expect(waiting).rejects.toBeInstanceOf(
      VideoSchedulerClosedError,
    );

    scheduler.close();
    await waitingRejection;
    await expect(
      scheduler.acquire("visible", new AbortController().signal),
    ).rejects.toBeInstanceOf(VideoSchedulerClosedError);
    expect(removeListener).toHaveBeenCalledOnce();
    active();
    expect(scheduler.activeCount).toBe(0);
  });

  it("makes release handles idempotent without granting excess capacity", async () => {
    const scheduler = new VideoSeekAdmissionScheduler(1);
    const active = await scheduler.acquire(
      "visible",
      new AbortController().signal,
    );
    const waiting = scheduler.acquire("visible", new AbortController().signal);

    active();
    active();
    const releaseWaiting = await waiting;
    expect(scheduler.activeCount).toBe(1);
    releaseWaiting();
    releaseWaiting();
    expect(scheduler.activeCount).toBe(0);
    scheduler.close();
  });
});
