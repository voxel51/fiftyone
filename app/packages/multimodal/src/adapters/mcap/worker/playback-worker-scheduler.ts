import type { McapPlaybackWorkerPriority } from "./playback-worker-types";

/**
 * Scheduled unit of MCAP worker work with priority and source affinity.
 */
export type McapPlaybackWorkerJob = {
  readonly id: number;
  readonly priority: McapPlaybackWorkerPriority;
  readonly run: () => Promise<void>;
  readonly sourceKey: string;
};

type QueuedJob = McapPlaybackWorkerJob & {
  readonly order: number;
};

/**
 * Serial priority scheduler for MCAP playback-worker requests.
 */
export class McapPlaybackWorkerScheduler {
  private cancelled = new Set<number>();
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

  enqueue(job: McapPlaybackWorkerJob) {
    if (this.disposed) {
      return;
    }

    this.cancelled.delete(job.id);
    this.queue.push({ ...job, order: this.nextOrder++ });
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

        try {
          await job.run();
        } catch (error) {
          console.error("MCAP playback worker job failed", {
            error,
            jobId: job.id,
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
