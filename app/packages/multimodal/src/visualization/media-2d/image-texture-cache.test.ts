import * as THREE from "three";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { ImageTextureHandle } from "./Base2dScene";
import {
  acquireImageTexture,
  IMAGE_TEXTURE_RETENTION_BYTE_CAP,
  IMAGE_TEXTURE_RETENTION_CAP,
  ImageTextureDecodeCancelledError,
  imageTextureCacheKey,
  imageTextureCacheStats,
  releaseRetainedImageTextures,
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

    const leasedA = await leaseA.promise;
    const leasedB = await leaseB.promise;
    expect(leasedA).not.toBe(handle);
    expect(leasedB).not.toBe(handle);
    expect(leasedA.texture).not.toBe(leasedB.texture);
    expect(leasedA.texture.source).not.toBe(leasedB.texture.source);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(imageTextureCacheStats().decodeCount).toBe(1);

    leaseA.release();
    leaseB.release();
  });

  it("re-acquires a released texture from retention without re-decoding", async () => {
    const { dispose, handle } = makeHandle();
    const decode = vi.fn(async () => handle);

    const first = acquireImageTexture("k", decode);
    const firstHandle = await first.promise;
    const firstDispose = vi.spyOn(firstHandle.texture, "dispose");
    first.release();
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(imageTextureCacheStats().retainedCount).toBe(1);
    expect(imageTextureCacheStats().retainedDecodedBytes).toBe(4);

    const second = acquireImageTexture("k", decode);
    const secondHandle = await second.promise;
    expect(secondHandle).not.toBe(handle);
    expect(secondHandle.texture).not.toBe(firstHandle.texture);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(imageTextureCacheStats().decodeCount).toBe(1);
    expect(imageTextureCacheStats().retainedCount).toBe(0);
    expect(imageTextureCacheStats().retainedDecodedBytes).toBe(0);
    expect(dispose).not.toHaveBeenCalled();

    second.release();
  });

  it("releases retention-ineligible decoded sources after their final lease", async () => {
    const decoded = makeHandle({ height: 480, width: 640 });
    const handle = { ...decoded.handle, retainWhenUnused: false };
    const lease = acquireImageTexture("video", async () => handle);
    await lease.promise;

    lease.release();

    expect(decoded.dispose).toHaveBeenCalledTimes(1);
    expect(imageTextureCacheStats()).toMatchObject({
      entryCount: 0,
      retainedCount: 0,
      retainedDecodedBytes: 0,
    });
  });

  it("accounts native depth retention and leased GPU bytes at source width", async () => {
    const observations: VisualizationCostObservation[] = [];
    setVisualizationCostObserver((observation) =>
      observations.push(observation),
    );
    const values = new Uint16Array([0, 1_000, 2_000]);
    const texture = new THREE.DataTexture(
      values,
      3,
      1,
      THREE.RedFormat,
      THREE.UnsignedShortType,
    ) as THREE.DataTexture & { normalized: boolean };
    texture.normalized = true;
    const handle: ImageTextureHandle = {
      aspectRatio: 3,
      decodedByteLength: 6,
      depthDisplay: {
        maxSampleValue: 2_000 / 65_535,
        minSampleValue: 1_000 / 65_535,
      },
      dispose: vi.fn(),
      imageHeight: 1,
      imageWidth: 3,
      texture,
    };
    const lease = acquireImageTexture("depth", async () => handle);
    const leased = await lease.promise;

    expect(leased.decodedByteLength).toBe(6);
    expect(leased.depthDisplay).toEqual(handle.depthDisplay);
    expect((leased.texture as typeof texture).normalized).toBe(true);
    expect(leased.texture.format).toBe(THREE.RedFormat);
    expect((leased.texture as THREE.DataTexture).image.data).toBe(values);
    expect(
      observations.find(
        (observation) =>
          observation.operation === "image-texture-lease" &&
          observation.declaredGpuBytesDelta === 6,
      ),
    ).toBeDefined();

    lease.release();
    expect(imageTextureCacheStats().retainedDecodedBytes).toBe(6);
    expect(
      observations.find(
        (observation) =>
          observation.operation === "image-texture-retention-add",
      ),
    ).toMatchObject({ retainedDecodedBytesDelta: 6 });
  });

  it("never accounts a negative decoded byte length", async () => {
    const observations: VisualizationCostObservation[] = [];
    setVisualizationCostObserver((observation) =>
      observations.push(observation),
    );
    const decoded = makeHandle();
    const handle: ImageTextureHandle = {
      ...decoded.handle,
      decodedByteLength: -1,
    };
    const lease = acquireImageTexture("invalid-bytes", async () => handle);
    await lease.promise;

    expect(
      observations.find(
        (observation) =>
          observation.operation === "image-texture-lease" &&
          observation.declaredGpuBytesDelta === Number.MAX_SAFE_INTEGER,
      ),
    ).toBeDefined();

    lease.release();
    expect(imageTextureCacheStats().retainedDecodedBytes).toBe(0);
    expect(decoded.dispose).toHaveBeenCalledTimes(1);
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
    await reacquired.promise;
    reacquired.release();
    expect(firstDispose).toHaveBeenCalledTimes(1);
  });

  it("evicts the oldest entries when decoded bytes reach the byte cap", async () => {
    const bytesPerFrame = 2048 * 1024 * 4;
    expect(IMAGE_TEXTURE_RETENTION_BYTE_CAP / bytesPerFrame).toBe(16);

    const first = makeHandle({ height: 1024, width: 2048 });
    const firstLease = acquireImageTexture("byte-0", async () => first.handle);
    await firstLease.promise;
    firstLease.release();

    for (let index = 1; index <= 16; index += 1) {
      const next = makeHandle({ height: 1024, width: 2048 });
      const lease = acquireImageTexture(
        `byte-${index}`,
        async () => next.handle,
      );
      await lease.promise;
      lease.release();
    }

    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(imageTextureCacheStats()).toMatchObject({
      entryCount: 16,
      retainedCount: 16,
      retainedDecodedBytes: IMAGE_TEXTURE_RETENTION_BYTE_CAP,
    });
  });

  it("does not retain one decoded image larger than the byte cap", async () => {
    const oversized = makeHandle({ height: 8192, width: 8192 });
    const lease = acquireImageTexture(
      "oversized",
      async () => oversized.handle,
    );
    await lease.promise;

    expect(oversized.dispose).not.toHaveBeenCalled();
    expect(imageTextureCacheStats().entryCount).toBe(1);

    lease.release();
    expect(oversized.dispose).toHaveBeenCalledTimes(1);
    expect(imageTextureCacheStats()).toMatchObject({
      entryCount: 0,
      retainedCount: 0,
      retainedDecodedBytes: 0,
    });
  });

  it("never evicts a live lease to satisfy the retained-byte budget", async () => {
    const live = makeHandle({ height: 8192, width: 8192 });
    const liveLease = acquireImageTexture("live", async () => live.handle);
    await liveLease.promise;

    for (let index = 0; index < 4; index += 1) {
      const retained = makeHandle({ height: 1024, width: 2048 });
      const lease = acquireImageTexture(
        `retained-${index}`,
        async () => retained.handle,
      );
      await lease.promise;
      lease.release();
    }

    expect(live.dispose).not.toHaveBeenCalled();
    expect(imageTextureCacheStats()).toMatchObject({
      entryCount: 5,
      retainedCount: 4,
      retainedDecodedBytes: 4 * 2048 * 1024 * 4,
    });

    liveLease.release();
    expect(live.dispose).toHaveBeenCalledTimes(1);
    expect(imageTextureCacheStats().entryCount).toBe(4);
  });

  it("clears retained byte accounting at a session boundary", async () => {
    const cached = makeHandle({ height: 20, width: 10 });
    const lease = acquireImageTexture("session", async () => cached.handle);
    await lease.promise;
    lease.release();
    expect(imageTextureCacheStats().retainedDecodedBytes).toBe(800);

    releaseRetainedImageTextures();
    expect(cached.dispose).toHaveBeenCalledTimes(1);
    expect(imageTextureCacheStats()).toMatchObject({
      entryCount: 0,
      retainedCount: 0,
      retainedDecodedBytes: 0,
    });
  });

  it("does not re-retain a live frame released after its session closes", async () => {
    const active = makeHandle({ height: 20, width: 10 });
    const lease = acquireImageTexture(
      "active-session",
      async () => active.handle,
    );
    await lease.promise;

    releaseRetainedImageTextures();
    expect(active.dispose).not.toHaveBeenCalled();
    lease.release();

    expect(active.dispose).toHaveBeenCalledTimes(1);
    expect(imageTextureCacheStats()).toMatchObject({
      entryCount: 0,
      retainedCount: 0,
      retainedDecodedBytes: 0,
    });
  });

  it("does not retain an in-flight frame that settles after its session closes", async () => {
    const pending = deferredDecode();
    const lease = acquireImageTexture("pending-session", pending.decode);

    releaseRetainedImageTextures();
    const expectation = expect(lease.promise).rejects.toBeInstanceOf(
      ImageTextureDecodeCancelledError,
    );
    lease.release();
    const decoded = makeHandle({ height: 20, width: 10 });
    pending.resolve(decoded.handle);
    await expectation;
    await Promise.resolve();

    expect(decoded.dispose).toHaveBeenCalledTimes(1);
    expect(imageTextureCacheStats()).toMatchObject({
      entryCount: 0,
      retainedCount: 0,
      retainedDecodedBytes: 0,
    });
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
    const retryHandle = await retry.promise;
    expect(retryHandle).not.toBe(handle);
    retry.release();
    expect(imageTextureCacheStats().decodeCount).toBe(2);
  });

  it("keeps the handle alive when one consumer releases mid-decode", async () => {
    const { decode, resolve } = deferredDecode();

    const leaseA = acquireImageTexture("k", decode);
    const leaseB = acquireImageTexture("k", decode);
    leaseA.release();

    const { dispose, handle } = makeHandle();
    resolve(handle);
    await leaseA.promise;
    await leaseB.promise;
    expect(dispose).not.toHaveBeenCalled();

    leaseB.release();
    // Zero refs → retained, still not disposed.
    expect(dispose).not.toHaveBeenCalled();
    expect(imageTextureCacheStats().retainedCount).toBe(1);
  });

  it("cancels a pending decode whose every lease was released", async () => {
    const { decode, resolve } = deferredDecode();

    const lease = acquireImageTexture("k", decode);
    const expectation = expect(lease.promise).rejects.toBeInstanceOf(
      ImageTextureDecodeCancelledError,
    );
    lease.release();

    const { dispose, handle } = makeHandle();
    resolve(handle);
    await expectation;
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
    expect(imageTextureCacheStats().retainedCount).toBe(0);

    const fresh = makeHandle();
    const reacquired = acquireImageTexture("k", async () => fresh.handle);
    await reacquired.promise;
    expect(imageTextureCacheStats().decodeCount).toBe(2);

    reacquired.release();
  });

  it("restarts one pending promise when a runway-bearing request is stronger", async () => {
    const weak = deferredDecode();
    const strong = deferredDecode();
    const attempts = [weak, strong];
    const signals: AbortSignal[] = [];
    const decode = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      const attempt = attempts.shift();
      if (!attempt) throw new Error("missing decode attempt");
      return attempt.decode();
    });

    const weakLease = acquireImageTexture("same-frame", decode, {
      decodeStrength: 0,
    });
    const strongLease = acquireImageTexture("same-frame", decode, {
      decodeStrength: 1,
    });

    expect(decode).toHaveBeenCalledTimes(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    const stale = makeHandle({ height: 2, width: 2 });
    weak.resolve(stale.handle);
    await Promise.resolve();
    expect(stale.dispose).toHaveBeenCalledOnce();

    const ready = makeHandle({ height: 8, width: 16 });
    strong.resolve(ready.handle);
    const [weakHandle, strongHandle] = await Promise.all([
      weakLease.promise,
      strongLease.promise,
    ]);
    expect(weakHandle.imageWidth).toBe(16);
    expect(strongHandle.imageWidth).toBe(16);
    expect(imageTextureCacheStats().decodeCount).toBe(2);

    weakLease.release();
    strongLease.release();
  });

  it("treats release as idempotent per lease", async () => {
    const { handle } = makeHandle();
    const decode = vi.fn(async () => handle);

    const leaseA = acquireImageTexture("k", decode);
    const leaseB = acquireImageTexture("k", decode);
    await Promise.all([leaseA.promise, leaseB.promise]);

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
      retainedDecodedBytes: 0,
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
      retainedDecodedBytes: 0,
    });

    leaseA.release();
    expect(imageTextureCacheStats()).toEqual({
      decodeCount: 2,
      entryCount: 2,
      retainedCount: 1,
      retainedDecodedBytes: 4,
    });

    leaseB.release();
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

function makeHandle(
  dimensions: { readonly height: number; readonly width: number } = {
    height: 1,
    width: 1,
  },
): { dispose: Mock; handle: ImageTextureHandle } {
  const dispose = vi.fn();
  const texture = new THREE.Texture({} as TexImageSource);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;

  return {
    dispose,
    handle: {
      aspectRatio: 1,
      dispose,
      imageHeight: dimensions.height,
      imageWidth: dimensions.width,
      texture,
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
