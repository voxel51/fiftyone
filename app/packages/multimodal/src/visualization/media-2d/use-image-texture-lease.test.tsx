import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import type {
  EncodedImageVisualization,
  RawImageVisualization,
} from "../../ir";
import { VISUALIZATION_KIND } from "../visualization-registry";
import type { ImageTextureHandle } from "./Base2dScene";
import {
  hasImageData,
  imageIdentity,
  useImageTextureLease,
} from "./use-image-texture-lease";
import { resetStillImageDecodeSchedulerForTests } from "./still-image-decode-scheduler";

const cacheHarness = vi.hoisted(() => {
  const leases: TestLease[] = [];
  return {
    acquire: vi.fn(() => {
      const lease = leases.shift();
      if (!lease) throw new Error("missing test image lease");
      return lease;
    }),
    leases,
  };
});

vi.mock("./image-texture-cache", () => ({
  acquireImageTexture: cacheHarness.acquire,
}));

interface TestLease {
  readonly promise: Promise<ImageTextureHandle>;
  readonly release: () => void;
}

describe("useImageTextureLease", () => {
  afterEach(() => {
    cacheHarness.leases.length = 0;
    cacheHarness.acquire.mockClear();
    resetStillImageDecodeSchedulerForTests();
    vi.restoreAllMocks();
  });

  it("uses native depth samples for availability and private identity", () => {
    const values = new Uint16Array([1_000]);
    const frame: RawImageVisualization = {
      depth: {
        maxValue: 1_000,
        metersPerUnit: 0.001,
        minValue: 1_000,
        values,
      },
      height: 1,
      kind: VISUALIZATION_KIND.RAW_IMAGE,
      rgba: new Uint8Array(0),
      sourceEncoding: "16UC1",
      width: 1,
    };

    expect(hasImageData(frame)).toBe(true);
    expect(imageIdentity(frame)).toBe(values);
  });

  it.each([
    [
      "message-bearing browser errors",
      { message: "Texture upload failed" },
      "Texture upload failed",
    ],
    ["opaque errors", null, "Image unavailable"],
  ])("renders %s", async (_label, error, expected) => {
    cacheHarness.leases.push({
      promise: Promise.reject(error),
      release: vi.fn(),
    });

    const rendered = renderHook(() =>
      useImageTextureLease({ frame: rawFrame(), identity: 1 }),
    );

    await waitFor(() => expect(rendered.result.current.status).toBe("error"));
    expect(rendered.result.current.errorMessage).toBe(expected);
  });

  it("reports a decoded texture to the callback that requested it", async () => {
    const pending = deferred<ImageTextureHandle>();
    const requested = vi.fn();
    const replacement = vi.fn();
    cacheHarness.leases.push({ promise: pending.promise, release: vi.fn() });

    const rendered = renderHook(
      ({ onLoaded }) =>
        useImageTextureLease({
          frame: rawFrame(),
          identity: 1,
          onLoaded,
        }),
      { initialProps: { onLoaded: requested } },
    );

    rendered.rerender({ onLoaded: replacement });
    const handle = textureHandle();
    await act(() => pending.resolve(handle));

    expect(requested).toHaveBeenCalledWith(handle);
    expect(replacement).not.toHaveBeenCalled();
    rendered.unmount();
  });

  it("commits a replacement before releasing the previously visible texture", async () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const first = deferred<ImageTextureHandle>();
    const second = deferred<ImageTextureHandle>();
    const handlesAtRelease: Array<ImageTextureHandle | null> = [];
    let observedHandle: ImageTextureHandle | null = null;
    cacheHarness.leases.push(
      {
        promise: first.promise,
        release: () => handlesAtRelease.push(observedHandle),
      },
      { promise: second.promise, release: vi.fn() },
    );

    const rendered = renderHook(
      ({ id }) => {
        const result = useImageTextureLease({
          frame: rawFrame(),
          identity: id,
        });
        observedHandle = result.handle;
        return result;
      },
      { initialProps: { id: 1 } },
    );

    const firstHandle = textureHandle();
    await act(() => first.resolve(firstHandle));
    await waitFor(() =>
      expect(rendered.result.current.handle).toBe(firstHandle),
    );

    rendered.rerender({ id: 2 });
    const secondHandle = textureHandle();
    await act(() => second.resolve(secondHandle));
    await waitFor(() =>
      expect(rendered.result.current.handle).toBe(secondHandle),
    );
    await waitFor(() =>
      expect(animationFrames.length).toBeGreaterThanOrEqual(1),
    );

    expect(handlesAtRelease).toEqual([]);
    act(() => flushAnimationFrame(animationFrames, 0));
    expect(handlesAtRelease).toEqual([]);
    await waitFor(() =>
      expect(animationFrames.length).toBeGreaterThanOrEqual(1),
    );
    act(() => flushAnimationFrame(animationFrames, 16));
    expect(handlesAtRelease).toEqual([secondHandle]);

    rendered.unmount();
  });

  it("conflates rapid still-image churn before acquiring cache leases", async () => {
    const first = deferred<ImageTextureHandle>();
    const latest = deferred<ImageTextureHandle>();
    const releaseFirst = vi.fn();
    const releaseLatest = vi.fn();
    cacheHarness.leases.push(
      { promise: first.promise, release: releaseFirst },
      { promise: latest.promise, release: releaseLatest },
    );
    const rendered = renderHook(
      ({ id }) =>
        useImageTextureLease({
          frame: encodedFrame(id),
          identity: id,
          textureKey: `recording\n/camera\n${id}`,
        }),
      { initialProps: { id: 1 } },
    );

    rendered.rerender({ id: 2 });
    rendered.rerender({ id: 3 });

    expect(cacheHarness.acquire).toHaveBeenCalledTimes(1);
    expect(releaseFirst).toHaveBeenCalledOnce();

    const staleHandle = textureHandle();
    await act(() => first.resolve(staleHandle));
    await waitFor(() => expect(cacheHarness.acquire).toHaveBeenCalledTimes(2));
    expect(rendered.result.current.handle).toBeNull();

    const latestHandle = textureHandle();
    await act(() => latest.resolve(latestHandle));
    await waitFor(() =>
      expect(rendered.result.current.handle).toBe(latestHandle),
    );
    expect(releaseLatest).not.toHaveBeenCalled();

    rendered.unmount();
  });
});

function rawFrame(): RawImageVisualization {
  return {
    height: 1,
    kind: VISUALIZATION_KIND.RAW_IMAGE,
    rgba: Uint8Array.of(255, 0, 0, 255),
    sourceEncoding: "rgba8",
    width: 1,
  };
}

function encodedFrame(id: number): EncodedImageVisualization {
  return {
    bytes: Uint8Array.of(id),
    kind: VISUALIZATION_KIND.ENCODED_IMAGE,
  };
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

function flushAnimationFrame(
  animationFrames: FrameRequestCallback[],
  timestamp: number,
) {
  const callbacks = animationFrames.splice(0);
  for (const callback of callbacks) {
    callback(timestamp);
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
