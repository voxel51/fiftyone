import type { VideoIntentPriority } from "./types";
import {
  VIDEO_INTENT_PRIORITY_WEIGHT,
  VideoIntentCancelledError,
  VideoSchedulerClosedError,
} from "./types";

interface Waiter {
  readonly abortListener: () => void;
  readonly enqueuedAt: number;
  priority: VideoIntentPriority;
  readonly reject: (error: Error) => void;
  readonly resolve: (release: () => void) => void;
  readonly sequence: number;
  readonly signal: AbortSignal;
}

/**
 * Bounds historical prerolls only. Forward decoders are never evicted or
 * parked to satisfy an arbitrary global decoder count.
 */
export class VideoSeekAdmissionScheduler {
  private active = 0;
  private closed = false;
  private sequence = 0;
  private readonly waiters: Waiter[] = [];

  constructor(
    private readonly capacity = 2,
    private readonly nowMs: () => number = () => performance.now(),
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError("capacity must be a positive safe integer");
    }
  }

  get activeCount(): number {
    return this.active;
  }

  get waitingCount(): number {
    return this.waiters.length;
  }

  acquire(
    priority: VideoIntentPriority,
    signal: AbortSignal,
  ): Promise<() => void> {
    if (this.closed) return Promise.reject(new VideoSchedulerClosedError());
    if (signal.aborted) return Promise.reject(new VideoIntentCancelledError());
    if (this.active < this.capacity && this.waiters.length === 0) {
      this.active += 1;
      return Promise.resolve(this.releaseHandle());
    }
    return new Promise<() => void>((resolve, reject) => {
      const waiter: Waiter = {
        abortListener: () => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new VideoIntentCancelledError());
        },
        enqueuedAt: this.nowMs(),
        priority,
        reject,
        resolve,
        sequence: this.sequence++,
        signal,
      };
      signal.addEventListener("abort", waiter.abortListener, { once: true });
      this.waiters.push(waiter);
      this.grant();
    });
  }

  /** Raises queued work in place without losing its age or FIFO sequence. */
  promote(signal: AbortSignal, priority: VideoIntentPriority): void {
    const waiter = this.waiters.find(
      (candidate) => candidate.signal === signal,
    );
    if (
      waiter &&
      VIDEO_INTENT_PRIORITY_WEIGHT[priority] >
        VIDEO_INTENT_PRIORITY_WEIGHT[waiter.priority]
    ) {
      waiter.priority = priority;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.signal.removeEventListener("abort", waiter.abortListener);
      waiter.reject(new VideoSchedulerClosedError());
    }
  }

  private releaseHandle(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active = Math.max(0, this.active - 1);
      this.grant();
    };
  }

  private grant(): void {
    while (!this.closed && this.active < this.capacity && this.waiters.length) {
      const now = this.nowMs();
      // One priority level of aging every two seconds prevents starvation.
      const score = (waiter: Waiter) =>
        VIDEO_INTENT_PRIORITY_WEIGHT[waiter.priority] +
        Math.floor((now - waiter.enqueuedAt) / 2_000);
      let bestIndex = 0;
      for (let index = 1; index < this.waiters.length; index += 1) {
        const candidate = this.waiters[index];
        const best = this.waiters[bestIndex];
        const delta = score(candidate) - score(best);
        if (delta > 0 || (delta === 0 && candidate.sequence < best.sequence)) {
          bestIndex = index;
        }
      }
      const [waiter] = this.waiters.splice(bestIndex, 1);
      if (!waiter) return;
      waiter.signal.removeEventListener("abort", waiter.abortListener);
      if (waiter.signal.aborted) {
        waiter.reject(new VideoIntentCancelledError());
        continue;
      }
      this.active += 1;
      waiter.resolve(this.releaseHandle());
    }
  }
}
