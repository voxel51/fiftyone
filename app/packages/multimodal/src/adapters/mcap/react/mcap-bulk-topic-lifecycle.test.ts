import { afterEach, describe, expect, it, vi } from "vitest";

import {
  startMcapBulkTopicLifecycle,
  type McapBulkTopicControl,
} from "./mcap-bulk-topic-lifecycle";

describe("startMcapBulkTopicLifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for a stood-down read to settle before retrying its topic", async () => {
    vi.useFakeTimers();
    let shouldStandDown = false;
    let activeReads = 0;
    let maxActiveReads = 0;
    let releaseFirstRead: () => void = () => undefined;
    const firstReadSettled = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    const runTopic = vi.fn(
      async (_topic: string, control: McapBulkTopicControl) => {
        activeReads += 1;
        maxActiveReads = Math.max(maxActiveReads, activeReads);
        if (runTopic.mock.calls.length === 1) {
          shouldStandDown = true;
          expect(control.standDown()).toBe(true);
          await firstReadSettled;
        }
        activeReads -= 1;
      },
    );

    const cancel = startMcapBulkTopicLifecycle({
      initialDelayMs: 0,
      retryDelayMs: 100,
      runTopic,
      shouldStandDown: () => shouldStandDown,
      topics: ["/pose"],
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(runTopic).toHaveBeenCalledTimes(1);

    shouldStandDown = false;
    releaseFirstRead();
    await firstReadSettled;
    await vi.advanceTimersByTimeAsync(99);
    expect(runTopic).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(runTopic).toHaveBeenCalledTimes(2);
    expect(maxActiveReads).toBe(1);
    cancel();
  });
});
