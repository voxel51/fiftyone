import type { McapPlaybackWorkerPriority } from "./playback-worker-types";

/**
 * Scheduled unit of MCAP worker work with priority and source affinity.
 */
export type McapPlaybackWorkerJob = {
  readonly id: number;
  readonly operation?: string;
  readonly priority: McapPlaybackWorkerPriority;
  readonly run: () => Promise<void>;
  readonly sourceKey: string;
};

type QueuedJob = McapPlaybackWorkerJob & {
  readonly order: number;
  readonly queuedAtMs: number;
};

export interface McapPlaybackWorkerSchedulerDebugLog {
  readonly event: "started" | "finished";
  readonly jobId: number;
  readonly operation?: string;
  readonly priority: McapPlaybackWorkerPriority;
  readonly queueDepth: number;
  readonly queueWaitMs: number;
  readonly runMs?: number;
  readonly sourceKey: string;
}

/**
 * Serial priority scheduler for MCAP playback-worker requests.
 */
export class McapPlaybackWorkerScheduler {
  private cancelled = new Set<number>();
  private debug = false;
  private disposed = false;
  private nextOrder = 0;
  private queue: QueuedJob[] = [];
  private running = false;

  cancel(id: number) {
    this.cancelled.add(id);
    this.queue = this.queue.filter((job) => job.id !== id);
  }

  dispose() {
    this.disposed = true;
    this.cancelled.clear();
    this.queue = [];
  }

  setDebug(enabled: boolean) {
    this.debug = enabled;
  }

  enqueue(job: McapPlaybackWorkerJob) {
    if (this.disposed) {
      return;
    }

    this.cancelled.delete(job.id);
    this.queue.push({
      ...job,
      order: this.nextOrder++,
      queuedAtMs: workerSchedulerNowMs(),
    });
    this.queue.sort(compareQueuedJobs);
    void this.drain();
  }

  private async drain() {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      while (!this.disposed) {
        const job = this.queue.shift();
        if (!job) {
          return;
        }

        if (this.cancelled.has(job.id)) {
          this.cancelled.delete(job.id);
          continue;
        }

        const startedAtMs = workerSchedulerNowMs();
        const queueWaitMs = Number((startedAtMs - job.queuedAtMs).toFixed(1));
        logWorkerSchedulerDebug(this.debug, {
          event: "started",
          jobId: job.id,
          operation: job.operation,
          priority: job.priority,
          queueDepth: this.queue.length,
          queueWaitMs,
          sourceKey: job.sourceKey,
        });

        try {
          await job.run();
        } catch (error) {
          console.error("MCAP playback worker job failed", {
            error,
            jobId: job.id,
            sourceKey: job.sourceKey,
          });
        } finally {
          logWorkerSchedulerDebug(this.debug, {
            event: "finished",
            jobId: job.id,
            operation: job.operation,
            priority: job.priority,
            queueDepth: this.queue.length,
            queueWaitMs,
            runMs: Number((workerSchedulerNowMs() - startedAtMs).toFixed(1)),
            sourceKey: job.sourceKey,
          });
        }
      }
    } finally {
      this.running = false;
    }
  }
}

function compareQueuedJobs(left: QueuedJob, right: QueuedJob) {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }

  return left.order - right.order;
}

function logWorkerSchedulerDebug(
  enabled: boolean,
  entry: McapPlaybackWorkerSchedulerDebugLog,
): void {
  if (!enabled) return;
  console.log("[mcap] worker job", entry);
}

function workerSchedulerNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}
