import type * as THREE from "three";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { ImageTextureHandle } from "./base-2d-scene";
import {
  acquireImageTexture,
  IMAGE_TEXTURE_RETENTION_CAP,
  imageTextureCacheKey,
  imageTextureCacheStats,
  resetImageTextureCacheForTests,
} from "./image-texture-cache";

beforeEach(() => {
  resetImageTextureCacheForTests();
});

describe("imageTextureCacheKey", () => {
  it("separates recording, topic, and content time unambiguously", () => {
    expect(imageTextureCacheKey("rec-a", "/CAM_FRONT/image", 7n)).not.toBe(
      imageTextureCacheKey("rec-b", "/CAM_FRONT/image", 7n),
    );
    expect(imageTextureCacheKey("rec-a", "/CAM_FRONT/image", 7n)).not.toBe(
      imageTextureCacheKey("rec-a", "/CAM_BACK/image", 7n),
    );
    expect(imageTextureCacheKey("rec-a", "/CAM_FRONT/image", 7n)).not.toBe(
      imageTextureCacheKey("rec-a", "/CAM_FRONT/image", 8n),
    );
    expect(imageTextureCacheKey("rec-a", "/CAM_FRONT/image", 7n)).toBe(
      imageTextureCacheKey("rec-a", "/CAM_FRONT/image", 7n),
    );
  });
});

describe("acquireImageTexture (shared keys)", () => {
  it("shares one decode between two concurrent acquires", async () => {
    const { decode, resolve } = deferredDecode();

    const leaseA = acquireImageTexture("k", decode);
    const leaseB = acquireImageTexture("k", decode);
    const { handle } = makeHandle();
    resolve(handle);

    await expect(leaseA.promise).resolves.toBe(handle);
    await expect(leaseB.promise).resolves.toBe(handle);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(imageTextureCacheStats().decodeCount).toBe(1);
  });

  it("re-acquires a released texture from retention without re-decoding", async () => {
    const { dispose, handle } = makeHandle();
    const decode = vi.fn(async () => handle);

    const first = acquireImageTexture("k", decode);
    await first.promise;
    first.release();
    expect(imageTextureCacheStats().retainedCount).toBe(1);

    const second = acquireImageTexture("k", decode);
    await expect(second.promise).resolves.toBe(handle);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(imageTextureCacheStats().decodeCount).toBe(1);
    expect(imageTextureCacheStats().retainedCount).toBe(0);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("disposes an entry exactly once when it ages out of retention", async () => {
    const { dispose: firstDispose, handle: firstHandle } = makeHandle();
    const first = acquireImageTexture("k-0", async () => firstHandle);
    await first.promise;
    first.release();

    // Fill the retention LRU past its cap; "k-0" is the oldest entry.
    for (let index = 1; index <= IMAGE_TEXTURE_RETENTION_CAP; index += 1) {
      const { handle } = makeHandle();
      const lease = acquireImageTexture(`k-${index}`, async () => handle);
      await lease.promise;
      lease.release();
    }

    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(imageTextureCacheStats().retainedCount).toBe(
      IMAGE_TEXTURE_RETENTION_CAP,
    );

    // The evicted key decodes fresh on the next acquire.
    const { handle: freshHandle } = makeHandle();
    const reacquired = acquireImageTexture("k-0", async () => freshHandle);
    await expect(reacquired.promise).resolves.toBe(freshHandle);
    reacquired.release();
    expect(firstDispose).toHaveBeenCalledTimes(1);
  });

  it("evicts a failed decode and rejects every waiter", async () => {
    const { decode, reject } = deferredDecode();

    const leaseA = acquireImageTexture("k", decode);
    const leaseB = acquireImageTexture("k", decode);
    const failure = new Error("decode failed");
    reject(failure);

    await expect(leaseA.promise).rejects.toBe(failure);
    await expect(leaseB.promise).rejects.toBe(failure);
    leaseA.release();
    leaseB.release();
    expect(imageTextureCacheStats().entryCount).toBe(0);

    // The key is not poisoned: the next acquire decodes again.
    const { handle } = makeHandle();
    const retry = acquireImageTexture("k", async () => handle);
    await expect(retry.promise).resolves.toBe(handle);
    expect(imageTextureCacheStats().decodeCount).toBe(2);
  });

  it("keeps the handle alive when one consumer releases mid-decode", async () => {
    const { decode, resolve } = deferredDecode();

    const leaseA = acquireImageTexture("k", decode);
    const leaseB = acquireImageTexture("k", decode);
    leaseA.release();

    const { dispose, handle } = makeHandle();
    resolve(handle);
    await expect(leaseB.promise).resolves.toBe(handle);
    expect(dispose).not.toHaveBeenCalled();

    leaseB.release();
    // Zero refs → retained, still not disposed.
    expect(dispose).not.toHaveBeenCalled();
    expect(imageTextureCacheStats().retainedCount).toBe(1);
  });

  it("retains a decode whose every lease was released before it settled", async () => {
    const { decode, resolve } = deferredDecode();

    const lease = acquireImageTexture("k", decode);
    lease.release();

    const { dispose, handle } = makeHandle();
    resolve(handle);
    await lease.promise;
    expect(dispose).not.toHaveBeenCalled();
    expect(imageTextureCacheStats().retainedCount).toBe(1);

    const reacquired = acquireImageTexture("k", decode);
    await expect(reacquired.promise).resolves.toBe(handle);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it("treats release as idempotent per lease", async () => {
    const { handle } = makeHandle();
    const decode = vi.fn(async () => handle);

    const leaseA = acquireImageTexture("k", decode);
    const leaseB = acquireImageTexture("k", decode);
    await leaseA.promise;

    leaseA.release();
    leaseA.release();
    // Lease B still holds the entry — double-releasing A must not retire it.
    expect(imageTextureCacheStats().retainedCount).toBe(0);

    leaseB.release();
    expect(imageTextureCacheStats().retainedCount).toBe(1);
  });

  it("reports decode and entry counts accurately", async () => {
    expect(imageTextureCacheStats()).toEqual({
      decodeCount: 0,
      entryCount: 0,
      retainedCount: 0,
    });

    const { handle: handleA } = makeHandle();
    const leaseA = acquireImageTexture("a", async () => handleA);
    const { handle: handleB } = makeHandle();
    const leaseB = acquireImageTexture("b", async () => handleB);
    await Promise.all([leaseA.promise, leaseB.promise]);

    expect(imageTextureCacheStats()).toEqual({
      decodeCount: 2,
      entryCount: 2,
      retainedCount: 0,
    });

    leaseA.release();
    expect(imageTextureCacheStats()).toEqual({
      decodeCount: 2,
      entryCount: 2,
      retainedCount: 1,
    });
  });
});

describe("acquireImageTexture (keyless)", () => {
  it("decodes privately per acquire and disposes on release", async () => {
    const first = makeHandle();
    const second = makeHandle();
    const handles = [first.handle, second.handle];
    const decode = vi.fn(async () => handles.shift() as ImageTextureHandle);

    const leaseA = acquireImageTexture(undefined, decode);
    const leaseB = acquireImageTexture(undefined, decode);
    await expect(leaseA.promise).resolves.toBe(first.handle);
    await expect(leaseB.promise).resolves.toBe(second.handle);
    expect(decode).toHaveBeenCalledTimes(2);
    expect(imageTextureCacheStats().decodeCount).toBe(2);
    // Keyless leases never enter the shared maps.
    expect(imageTextureCacheStats().entryCount).toBe(0);

    leaseA.release();
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).not.toHaveBeenCalled();
    leaseB.release();
    leaseB.release();
    expect(second.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes on settle when released mid-decode", async () => {
    const { decode, resolve } = deferredDecode();

    const lease = acquireImageTexture(undefined, decode);
    lease.release();

    const { dispose, handle } = makeHandle();
    resolve(handle);
    await lease.promise;
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

function makeHandle(): { dispose: Mock; handle: ImageTextureHandle } {
  const dispose = vi.fn();
  return {
    dispose,
    handle: {
      aspectRatio: 1,
      dispose,
      imageHeight: 1,
      imageWidth: 1,
      texture: {} as THREE.Texture,
    },
  };
}

function deferredDecode() {
  let resolve!: (handle: ImageTextureHandle) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<ImageTextureHandle>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { decode: vi.fn(() => promise), reject, resolve };
}
