import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import type { RawImageVisualization } from "../../ir";
import { VISUALIZATION_KIND } from "../visualization-registry";
import type { ImageTextureHandle } from "./Base2dScene";
import { useImageTextureLease } from "./use-image-texture-lease";
import { VideoTextureWaitError } from "./video-texture";

const leases = vi.hoisted(() => [] as TestLease[]);

vi.mock("./image-texture-cache", () => ({
  acquireImageTexture: () => {
    const lease = leases.shift();
    if (!lease) throw new Error("missing test image lease");
    return lease;
  },
}));

interface TestLease {
  readonly promise: Promise<ImageTextureHandle>;
  readonly release: () => void;
}

describe("useImageTextureLease", () => {
  afterEach(() => {
    leases.length = 0;
    vi.restoreAllMocks();
  });

  it("classifies expected decoder waits without inspecting message text", async () => {
    leases.push({
      promise: Promise.reject(
        new VideoTextureWaitError("Decoder prerequisites pending"),
      ),
      release: vi.fn(),
    });

    const rendered = renderHook(() =>
      useImageTextureLease({ frame: rawFrame(), identity: 1 }),
    );

    await waitFor(() => expect(rendered.result.current.status).toBe("error"));
    expect(rendered.result.current.errorKind).toBe("waiting");
    expect(rendered.result.current.errorMessage).toBe(
      "Decoder prerequisites pending",
    );
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
    leases.push(
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

    expect(handlesAtRelease).toEqual([]);
    act(() => animationFrames.shift()?.(0));
    expect(handlesAtRelease).toEqual([]);
    act(() => animationFrames.shift()?.(16));
    expect(handlesAtRelease).toEqual([secondHandle]);

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

function textureHandle(): ImageTextureHandle {
  return {
    aspectRatio: 1,
    dispose: vi.fn(),
    imageHeight: 1,
    imageWidth: 1,
    texture: new THREE.Texture(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
