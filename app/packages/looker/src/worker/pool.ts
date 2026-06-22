import { LookerUtils } from "../lookers/shared";
import { createWorker } from "../util";

// single shared decode-worker pool for the whole looker package; capped so high-core
// machines don't over-spawn, and held on globalThis so HMR reuses it across re-eval
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
