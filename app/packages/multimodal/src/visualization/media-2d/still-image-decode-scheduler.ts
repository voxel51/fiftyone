import type { ImageTextureHandle } from "./Base2dScene";
import type { ImageTextureLease } from "./image-texture-cache";

/** Browser decode concurrency shared by compressed still-image consumers. */
const MAX_CONCURRENT_STILL_IMAGE_DECODES = 4;

class StillImageDecodeCancelledError extends Error {
  constructor() {
    super("Still-image decode request was superseded");
    this.name = "StillImageDecodeCancelledError";
  }
}

interface ScheduledLeaseTask {
  readonly acquire: () => ImageTextureLease;
  readonly owner: object;
  readonly promise: Promise<ImageTextureHandle>;
  readonly reject: (error: unknown) => void;
  readonly resolve: (handle: ImageTextureHandle) => void;
  lease: ImageTextureLease | null;
  released: boolean;
  settled: boolean;
  started: boolean;
}

/**
 * Globally bounds browser still-image decode work while retaining only the
 * latest queued request per mounted consumer. Running createImageBitmap work
 * cannot be aborted, so one running request is allowed to finish; every
 * superseded request that has not started is rejected without touching the
 * refcounted image cache.
 */
export class StillImageDecodeScheduler {
  private activeCount = 0;
  private readonly activeOwners = new Set<object>();
  private readonly pendingByOwner = new Map<object, ScheduledLeaseTask>();

  constructor(private readonly maxConcurrent: number) {}

  schedule(owner: object, acquire: () => ImageTextureLease): ImageTextureLease {
    let resolve!: (handle: ImageTextureHandle) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<ImageTextureHandle>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    const task: ScheduledLeaseTask = {
      acquire,
      lease: null,
      owner,
      promise,
      reject,
      released: false,
      resolve,
      settled: false,
      started: false,
    };

    const pending = this.pendingByOwner.get(owner);
    if (pending) this.cancelPending(pending);
    this.pendingByOwner.set(owner, task);
    this.pump();

    return {
      promise,
      release: () => this.release(task),
    };
  }

  stats(): { readonly activeCount: number; readonly pendingCount: number } {
    return {
      activeCount: this.activeCount,
      pendingCount: this.pendingByOwner.size,
    };
  }

  dispose(): void {
    for (const task of this.pendingByOwner.values()) {
      this.cancelPending(task);
    }
    this.pendingByOwner.clear();
  }

  private cancelPending(task: ScheduledLeaseTask): void {
    if (task.started || task.settled) return;
    if (this.pendingByOwner.get(task.owner) === task) {
      this.pendingByOwner.delete(task.owner);
    }
    task.released = true;
    task.settled = true;
    task.reject(new StillImageDecodeCancelledError());
  }

  private finish(task: ScheduledLeaseTask): void {
    if (task.settled) return;
    task.settled = true;
    this.activeCount = Math.max(0, this.activeCount - 1);
    this.activeOwners.delete(task.owner);
    this.pump();
  }

  private pump(): void {
    while (
      this.activeCount < this.maxConcurrent &&
      this.pendingByOwner.size > 0
    ) {
      let next: [object, ScheduledLeaseTask] | undefined;
      for (const entry of this.pendingByOwner) {
        if (!this.activeOwners.has(entry[0])) {
          next = entry;
          break;
        }
      }
      if (!next) return;
      const [owner, task] = next;
      this.pendingByOwner.delete(owner);
      this.start(task);
    }
  }

  private release(task: ScheduledLeaseTask): void {
    if (task.released) return;
    task.released = true;
    if (task.started) {
      task.lease?.release();
      return;
    }
    this.cancelPending(task);
  }

  private start(task: ScheduledLeaseTask): void {
    task.started = true;
    this.activeCount += 1;
    this.activeOwners.add(task.owner);

    let lease: ImageTextureLease;
    try {
      lease = task.acquire();
    } catch (error) {
      task.reject(error);
      this.finish(task);
      return;
    }
    task.lease = lease;
    if (task.released) lease.release();
    lease.promise.then(task.resolve, task.reject).then(
      () => this.finish(task),
      () => this.finish(task),
    );
  }
}

let sharedScheduler = new StillImageDecodeScheduler(
  MAX_CONCURRENT_STILL_IMAGE_DECODES,
);

/** Schedules one cache lease through the shared latest-wins decode runway. */
export function scheduleStillImageTextureLease(
  owner: object,
  acquire: () => ImageTextureLease,
): ImageTextureLease {
  return sharedScheduler.schedule(owner, acquire);
}

/** Test-only reset that leaves already-running browser work self-contained. */
export function resetStillImageDecodeSchedulerForTests(): void {
  sharedScheduler.dispose();
  sharedScheduler = new StillImageDecodeScheduler(
    MAX_CONCURRENT_STILL_IMAGE_DECODES,
  );
}
