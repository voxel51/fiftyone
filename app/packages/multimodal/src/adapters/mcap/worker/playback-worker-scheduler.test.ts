import { describe, expect, it } from "vitest";
import { MCAP_PLAYBACK_WORKER_PRIORITY } from "./playback-worker-types";
import { McapPlaybackWorkerScheduler } from "./playback-worker-scheduler";

describe("MCAP playback worker scheduler", () => {
  it("runs one job at a time and prioritizes current frames before playback batches", async () => {
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

    await Promise.resolve();
    expect(ran).toEqual(["batch-1"]);

    firstJob.resolve();
    await flushAsync();

    expect(ran).toEqual(["batch-1", "current", "batch-2"]);
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

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
}
