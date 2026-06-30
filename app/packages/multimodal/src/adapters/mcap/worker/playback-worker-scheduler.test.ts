import { describe, expect, it, vi } from "vitest";
import { MCAP_PLAYBACK_WORKER_PRIORITY } from "./playback-worker-types";
import { McapPlaybackWorkerScheduler } from "./playback-worker-scheduler";

describe("MCAP playback worker scheduler", () => {
  it("runs one job at a time and prioritizes current, placement, then playback work", async () => {
    const scheduler = new McapPlaybackWorkerScheduler();
    const firstJob = deferred<void>();
    const ran: string[] = [];

    scheduler.enqueue({
      id: 1,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.PLAYBACK_BATCH,
      run: async () => {
        ran.push("batch-1");
        await firstJob.promise;
      },
      sourceKey: "source",
    });
    scheduler.enqueue({
      id: 2,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.PLAYBACK_BATCH,
      run: async () => {
        ran.push("batch-2");
      },
      sourceKey: "source",
    });
    scheduler.enqueue({
      id: 3,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      run: async () => {
        ran.push("current");
      },
      sourceKey: "source",
    });
    scheduler.enqueue({
      id: 4,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.PLACEMENT_FRAME,
      run: async () => {
        ran.push("placement");
      },
      sourceKey: "source",
    });

    await Promise.resolve();
    expect(ran).toEqual(["batch-1"]);

    firstJob.resolve();
    await flushAsync(4);

    expect(ran).toEqual(["batch-1", "current", "placement", "batch-2"]);
  });

  it("skips queued jobs that are cancelled before they start", async () => {
    const scheduler = new McapPlaybackWorkerScheduler();
    const firstJob = deferred<void>();
    const ran: string[] = [];

    scheduler.enqueue({
      id: 1,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.PLAYBACK_BATCH,
      run: async () => {
        ran.push("first");
        await firstJob.promise;
      },
      sourceKey: "source",
    });
    scheduler.enqueue({
      id: 2,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      run: async () => {
        ran.push("cancelled");
      },
      sourceKey: "source",
    });
    scheduler.cancel(2);

    firstJob.resolve();
    await flushAsync();

    expect(ran).toEqual(["first"]);
  });

  it("logs queue wait and run timing when debug is enabled", async () => {
    const scheduler = new McapPlaybackWorkerScheduler();
    const consoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);

    try {
      scheduler.setDebug(true);
      scheduler.enqueue({
        id: 1,
        operation: "readSynchronizedMessages",
        priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
        run: async () => undefined,
        sourceKey: "source",
      });

      await flushAsync();

      expect(consoleLog).toHaveBeenCalledWith(
        "[mcap] worker job",
        expect.objectContaining({
          event: "started",
          jobId: 1,
          operation: "readSynchronizedMessages",
          priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
          queueWaitMs: expect.any(Number),
          sourceKey: "source",
        }),
      );
      expect(consoleLog).toHaveBeenCalledWith(
        "[mcap] worker job",
        expect.objectContaining({
          event: "finished",
          jobId: 1,
          operation: "readSynchronizedMessages",
          runMs: expect.any(Number),
          sourceKey: "source",
        }),
      );
    } finally {
      consoleLog.mockRestore();
    }
  });

  it("continues draining after a rejected job", async () => {
    const scheduler = new McapPlaybackWorkerScheduler();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const ran: string[] = [];

    try {
      scheduler.enqueue({
        id: 1,
        priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
        run: async () => {
          ran.push("failed");
          throw new Error("boom");
        },
        sourceKey: "source",
      });
      scheduler.enqueue({
        id: 2,
        priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
        run: async () => {
          ran.push("next");
        },
        sourceKey: "source",
      });

      await flushAsync();

      expect(ran).toEqual(["failed", "next"]);
      expect(consoleError).toHaveBeenCalledWith(
        "MCAP playback worker job failed",
        expect.objectContaining({
          jobId: 1,
          sourceKey: "source",
        }),
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

async function flushAsync(iterations = 2) {
  for (let index = 0; index < iterations; index++) {
    await Promise.resolve();
  }
}
