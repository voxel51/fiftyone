import { afterEach, describe, expect, it, vi } from "vitest";

import {
  startBulkStreamLifecycle,
  type BulkStreamControl,
} from "./bulk-stream-lifecycle";

describe("startBulkStreamLifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for a stood-down read to settle before retrying its stream", async () => {
    vi.useFakeTimers();
    let shouldStandDown = false;
    let activeReads = 0;
    let maxActiveReads = 0;
    let releaseFirstRead: () => void = () => undefined;
    const firstReadSettled = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    const runStream = vi.fn(
      async (_stream: string, control: BulkStreamControl) => {
        activeReads += 1;
        maxActiveReads = Math.max(maxActiveReads, activeReads);
        if (runStream.mock.calls.length === 1) {
          shouldStandDown = true;
          expect(control.standDown()).toBe(true);
          await firstReadSettled;
        }
        activeReads -= 1;
      },
    );

    const cancel = startBulkStreamLifecycle({
      initialDelayMs: 0,
      retryDelayMs: 100,
      runStream,
      shouldStandDown: () => shouldStandDown,
      streams: ["/pose"],
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(runStream).toHaveBeenCalledTimes(1);

    shouldStandDown = false;
    releaseFirstRead();
    await firstReadSettled;
    await vi.advanceTimersByTimeAsync(99);
    expect(runStream).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(runStream).toHaveBeenCalledTimes(2);
    expect(maxActiveReads).toBe(1);
    cancel();
  });

  it("aborts active stream work when the lifecycle is cancelled", () => {
    let control: BulkStreamControl | undefined;
    const runStream = vi.fn(
      async (_stream: string, nextControl: BulkStreamControl) => {
        control = nextControl;
        await new Promise<void>(() => undefined);
      },
    );

    const cancel = startBulkStreamLifecycle({
      initialDelayMs: 0,
      retryDelayMs: 100,
      runStream,
      shouldStandDown: () => false,
      streams: ["/location"],
    });

    expect(control?.signal.aborted).toBe(false);
    cancel();
    expect(control?.signal.aborted).toBe(true);
  });
});
