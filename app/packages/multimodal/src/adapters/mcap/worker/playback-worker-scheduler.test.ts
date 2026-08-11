import { describe, expect, it, vi } from "vitest";
import { MCAP_PLAYBACK_WORKER_PRIORITY } from "./playback-worker-types";
import { McapPlaybackWorkerScheduler } from "./playback-worker-scheduler";

describe("MCAP playback worker scheduler", () => {
  it("orders paused inspection behind playback and ahead of idle work", async () => {
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
      run: () => {
        ran.push("batch-2");
        return Promise.resolve();
      },
      sourceKey: "source",
    });
    scheduler.enqueue({
      id: 3,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      run: () => {
        ran.push("current");
        return Promise.resolve();
      },
      sourceKey: "source",
    });
    scheduler.enqueue({
      id: 4,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.PLACEMENT_FRAME,
      run: () => {
        ran.push("placement");
        return Promise.resolve();
      },
      sourceKey: "source",
    });
    scheduler.enqueue({
      id: 5,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
      run: () => {
        ran.push("idle");
        return Promise.resolve();
      },
      sourceKey: "source",
    });
    scheduler.enqueue({
      id: 6,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.PAUSED_INSPECTION,
      run: () => {
        ran.push("inspection");
        return Promise.resolve();
      },
      sourceKey: "source",
    });

    await Promise.resolve();
    expect(ran).toEqual(["batch-1"]);

    firstJob.resolve();
    await flushAsync(8);

    expect(ran).toEqual([
      "batch-1",
      "current",
      "placement",
      "batch-2",
      "inspection",
      "idle",
    ]);
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
      operation: "readBoundedMessages",
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
      run: () => {
        ran.push("cancelled");
        return Promise.resolve();
      },
      sourceKey: "source",
    });
    expect(scheduler.cancel(2)).toEqual({
      operation: "readBoundedMessages",
      state: "queued",
    });

    firstJob.resolve();
    await flushAsync();

    expect(ran).toEqual(["first"]);
  });

  it("aborts the running job's signal when it is cancelled", async () => {
    const scheduler = new McapPlaybackWorkerScheduler();
    const gate = deferred<void>();
    const signals: AbortSignal[] = [];

    scheduler.enqueue({
      id: 7,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
      run: (context) => {
        signals.push(context.signal);
        return gate.promise;
      },
      sourceKey: "source",
    });
    await flushAsync();
    expect(signals[0]?.aborted).toBe(false);

    expect(scheduler.cancel(7)).toEqual({ state: "running" });
    expect(signals[0]?.aborted).toBe(true);

    gate.resolve();
    await flushAsync();

    // The next job gets a fresh, unaborted signal.
    scheduler.enqueue({
      id: 8,
      priority: MCAP_PLAYBACK_WORKER_PRIORITY.IDLE_PREFETCH,
      run: (context) => {
        signals.push(context.signal);
        return Promise.resolve();
      },
      sourceKey: "source",
    });
    await flushAsync();
    expect(signals[1]?.aborted).toBe(false);
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
        run: () => Promise.resolve(),
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
          sourceKey: "source",
        }),
      );
      expect(consoleLog).toHaveBeenCalledWith(
        "[mcap] worker job",
        expect.objectContaining({
          event: "finished",
          jobId: 1,
          operation: "readSynchronizedMessages",
          sourceKey: "source",
        }),
      );
      const startedDetails: unknown = consoleLog.mock.calls[0]?.[1];
      const finishedDetails: unknown = consoleLog.mock.calls[1]?.[1];
      if (!isRecord(startedDetails) || !isRecord(finishedDetails)) {
        throw new Error("Expected structured scheduler debug details");
      }
      expect(typeof startedDetails.queueWaitMs).toBe("number");
      expect(typeof finishedDetails.runMs).toBe("number");
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
        run: () => {
          ran.push("failed");
          return Promise.reject(new Error("boom"));
        },
        sourceKey: "source",
      });
      scheduler.enqueue({
        id: 2,
        priority: MCAP_PLAYBACK_WORKER_PRIORITY.CURRENT_FRAME,
        run: () => {
          ran.push("next");
          return Promise.resolve();
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

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
