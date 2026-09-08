import {
  EpisodeReadCancelledError,
  type BudgetedReadJob,
  type BudgetedReadRequest,
  type BudgetedReadResult,
  type SourceReadBudgetAccount,
} from "../ports";

interface PendingRead {
  readonly reject: (reason?: unknown) => void;
  readonly request: BudgetedReadRequest;
  readonly resolve: (result: BudgetedReadResult) => void;
}

interface ScheduledJob {
  active: boolean;
  readonly pending: PendingRead[];
  queued: boolean;
  readonly source: BudgetedReadJob;
}

/**
 * Serializes one source account with round-robin job fairness.
 *
 * Consumers still own their continuations and grant sizes. This wrapper only
 * decides which independently resumable job receives the next grant, so a
 * full-history pump cannot drain the cumulative account ahead of a newly
 * demanded playhead-local job.
 */
export function createScheduledSourceReadBudgetAccount(
  account: SourceReadBudgetAccount,
): SourceReadBudgetAccount {
  const runnable: ScheduledJob[] = [];
  let running = false;

  const schedule = (job: ScheduledJob, request: BudgetedReadRequest) =>
    new Promise<BudgetedReadResult>((resolve, reject) => {
      job.pending.push({ reject, request, resolve });
      if (!job.active && !job.queued) {
        job.queued = true;
        runnable.push(job);
      }
      void pump();
    });

  const pump = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      while (runnable.length > 0) {
        const job = runnable.shift();
        if (!job) continue;
        job.queued = false;
        const pending = job.pending.shift();
        if (!pending) continue;
        if (pending.request.signal?.aborted) {
          pending.reject(
            pending.request.signal.reason ?? new EpisodeReadCancelledError(),
          );
          if (job.pending.length > 0 && !job.queued) {
            job.queued = true;
            runnable.push(job);
          }
          continue;
        }
        job.active = true;
        try {
          pending.resolve(await job.source.read(pending.request));
        } catch (error) {
          pending.reject(error);
        }
        job.active = false;
        if (job.pending.length > 0 && !job.queued) {
          job.queued = true;
          runnable.push(job);
        }
      }
    } finally {
      running = false;
      if (runnable.length > 0) void pump();
    }
  };

  return {
    createJob() {
      const job: ScheduledJob = {
        active: false,
        pending: [],
        queued: false,
        source: account.createJob(),
      };
      return { read: (request) => schedule(job, request) };
    },
    remaining: () => account.remaining(),
    reserve: (budget) => account.reserve(budget),
  };
}
