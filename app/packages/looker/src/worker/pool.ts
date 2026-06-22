import { LookerUtils } from "../lookers/shared";
import { createWorker } from "../util";

// Single shared decode-worker pool for the whole looker package. There used to be
// TWO module-scope pools — initial label load (abstract.ts) and async re-render
// (async-labels-rendering-manager.ts) — each sized to navigator.hardwareConcurrency,
// doubling worker threads/memory for no benefit since both run the identical worker
// script. Capped so high-core machines don't spawn a huge pool, and persisted on
// globalThis so HMR module re-eval reuses it instead of orphaning the old (never
// terminated) workers.
const MAX_WORKERS =
  typeof window !== "undefined"
    ? Math.min(navigator.hardwareConcurrency || 4, 8)
    : 0;

interface SharedPool {
  workers: Worker[];
  next: number;
}

const pool = (): SharedPool => {
  const g = globalThis as unknown as { __foWorkerPool__?: SharedPool };
  if (!g.__foWorkerPool__) {
    g.__foWorkerPool__ = {
      workers: Array.from({ length: MAX_WORKERS }, () =>
        createWorker(LookerUtils.workerCallbacks)
      ),
      next: -1,
    };
  }
  return g.__foWorkerPool__;
};

/** All workers in the shared pool (stable array for the page lifetime). */
export const workerPool = (): Worker[] => pool().workers;

/** Round-robin the next worker from the shared pool. */
export const nextWorker = (): Worker => {
  const p = pool();
  p.next = (p.next + 1) % p.workers.length;
  return p.workers[p.next];
};
