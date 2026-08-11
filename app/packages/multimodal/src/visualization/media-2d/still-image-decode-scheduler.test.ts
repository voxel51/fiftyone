import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import type { ImageTextureHandle } from "./Base2dScene";
import type { ImageTextureLease } from "./image-texture-cache";
import { StillImageDecodeScheduler } from "./still-image-decode-scheduler";

describe("StillImageDecodeScheduler", () => {
  it("runs one request per owner and starts only the latest queued frame", async () => {
    const scheduler = new StillImageDecodeScheduler(1);
    const owner = {};
    const first = deferredLease();
    const skipped = deferredLease();
    const latest = deferredLease();
    const firstAcquire = vi.fn(() => first.lease);
    const skippedAcquire = vi.fn(() => skipped.lease);
    const latestAcquire = vi.fn(() => latest.lease);

    const firstScheduled = scheduler.schedule(owner, firstAcquire);
    const skippedScheduled = scheduler.schedule(owner, skippedAcquire);
    const skippedFailure = skippedScheduled.promise.catch((error) => error);
    const latestScheduled = scheduler.schedule(owner, latestAcquire);

    expect(firstAcquire).toHaveBeenCalledOnce();
    expect(skippedAcquire).not.toHaveBeenCalled();
    expect(latestAcquire).not.toHaveBeenCalled();
    await expect(skippedFailure).resolves.toMatchObject({
      name: "StillImageDecodeCancelledError",
    });
    expect(scheduler.stats()).toEqual({ activeCount: 1, pendingCount: 1 });

    first.resolve(textureHandle());
    await firstScheduled.promise;
    await Promise.resolve();

    expect(latestAcquire).toHaveBeenCalledOnce();
    expect(scheduler.stats()).toEqual({ activeCount: 1, pendingCount: 0 });

    latest.resolve(textureHandle());
    await latestScheduled.promise;
    await Promise.resolve();
    expect(scheduler.stats()).toEqual({ activeCount: 0, pendingCount: 0 });
  });

  it("bounds concurrent work across independent image consumers", async () => {
    const scheduler = new StillImageDecodeScheduler(2);
    const first = deferredLease();
    const second = deferredLease();
    const third = deferredLease();
    const acquires = [first, second, third].map((entry) =>
      vi.fn(() => entry.lease),
    );
    const scheduled = acquires.map((acquire) =>
      scheduler.schedule({}, acquire),
    );

    expect(acquires.map((acquire) => acquire.mock.calls.length)).toEqual([
      1, 1, 0,
    ]);
    expect(scheduler.stats()).toEqual({ activeCount: 2, pendingCount: 1 });

    first.resolve(textureHandle());
    await scheduled[0].promise;
    await Promise.resolve();

    expect(acquires[2]).toHaveBeenCalledOnce();
    second.resolve(textureHandle());
    third.resolve(textureHandle());
    await Promise.all([scheduled[1].promise, scheduled[2].promise]);
  });

  it("releases a started cache lease and cancels queued work idempotently", async () => {
    const scheduler = new StillImageDecodeScheduler(1);
    const running = deferredLease();
    const queued = deferredLease();
    const runningScheduled = scheduler.schedule({}, () => running.lease);
    const queuedScheduled = scheduler.schedule({}, () => queued.lease);
    const queuedFailure = queuedScheduled.promise.catch((error) => error);

    runningScheduled.release();
    runningScheduled.release();
    queuedScheduled.release();
    queuedScheduled.release();

    expect(running.release).toHaveBeenCalledOnce();
    expect(queued.release).not.toHaveBeenCalled();
    await expect(queuedFailure).resolves.toMatchObject({
      name: "StillImageDecodeCancelledError",
    });

    running.resolve(textureHandle());
    await runningScheduled.promise;
  });
});

function deferredLease(): {
  readonly lease: ImageTextureLease;
  readonly release: ReturnType<typeof vi.fn>;
  readonly resolve: (handle: ImageTextureHandle) => void;
} {
  let resolve!: (handle: ImageTextureHandle) => void;
  const promise = new Promise<ImageTextureHandle>((done) => {
    resolve = done;
  });
  const release = vi.fn();
  return { lease: { promise, release }, release, resolve };
}

function textureHandle(): ImageTextureHandle {
  return {
    aspectRatio: 1,
    dispose: vi.fn(),
    imageHeight: 1,
    imageWidth: 1,
    texture: new THREE.Texture(),
  };
}
