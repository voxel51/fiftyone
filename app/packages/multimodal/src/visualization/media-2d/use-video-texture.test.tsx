import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import type { VideoPresentation } from "../../video/types";
import { useVideoTexture } from "./use-video-texture";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useVideoTexture", () => {
  it("clears the handle and releases its lease without a presentation", async () => {
    const release = vi.fn();
    const presentation: VideoPresentation = {
      acquire: () => ({
        height: 480,
        release,
        source: document.createElement("canvas"),
        timeNs: 1n,
        width: 640,
      }),
      height: 480,
      live: true,
      timeNs: 1n,
      width: 640,
    };
    const { result, rerender } = renderHook(
      ({ value }: { readonly value: VideoPresentation | null }) =>
        useVideoTexture(value),
      { initialProps: { value: presentation as VideoPresentation | null } },
    );
    await waitFor(() => expect(result.current).not.toBeNull());

    rerender({ value: null });
    await waitFor(() => expect(result.current).toBeNull());
    expect(release).toHaveBeenCalledOnce();
  });

  it("reuses the renderer texture and retires only the prior lease", async () => {
    const textureDispose = vi.spyOn(THREE.Texture.prototype, "dispose");
    const firstRelease = vi.fn();
    const secondRelease = vi.fn();
    const firstSource = document.createElement("canvas");
    const secondSource = document.createElement("canvas");
    const first = presentation(1n, firstRelease, firstSource);
    const second = presentation(2n, secondRelease, secondSource);
    const onLoaded = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }: { readonly value: VideoPresentation }) =>
        useVideoTexture(value, onLoaded),
      { initialProps: { value: first } },
    );
    await waitFor(() => expect(result.current).not.toBeNull());
    const firstHandle = result.current;

    rerender({ value: second });
    await waitFor(() => expect(result.current).not.toBe(firstHandle));
    expect(result.current?.texture).toBe(firstHandle?.texture);
    expect(result.current?.texture.image).toBe(secondSource);
    expect(textureDispose).not.toHaveBeenCalled();
    expect(firstRelease).toHaveBeenCalledOnce();
    expect(secondRelease).not.toHaveBeenCalled();
    expect(onLoaded).toHaveBeenLastCalledWith(result.current);
  });

  it("recreates the renderer texture when frame dimensions change", async () => {
    const textureDispose = vi.spyOn(THREE.Texture.prototype, "dispose");
    const firstRelease = vi.fn();
    const secondRelease = vi.fn();
    const first = presentation(1n, firstRelease);
    const second = presentation(
      2n,
      secondRelease,
      document.createElement("canvas"),
      1280,
      720,
    );
    const { result, rerender } = renderHook(
      ({ value }: { readonly value: VideoPresentation }) =>
        useVideoTexture(value),
      { initialProps: { value: first } },
    );
    await waitFor(() => expect(result.current).not.toBeNull());
    const firstTexture = result.current?.texture;

    rerender({ value: second });
    await waitFor(() => expect(result.current?.texture).not.toBe(firstTexture));
    expect(result.current?.imageWidth).toBe(1280);
    expect(result.current?.imageHeight).toBe(720);
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(firstRelease).toHaveBeenCalledOnce();
    expect(secondRelease).not.toHaveBeenCalled();
  });

  it("disposes the stable texture and current lease on unmount", async () => {
    const textureDispose = vi.spyOn(THREE.Texture.prototype, "dispose");
    const release = vi.fn();
    const current = presentation(1n, release);
    const { result, unmount } = renderHook(() => useVideoTexture(current));
    await waitFor(() => expect(result.current).not.toBeNull());

    unmount();

    expect(textureDispose).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });
});

function presentation(
  timeNs: bigint,
  release: () => void,
  source = document.createElement("canvas"),
  width = 640,
  height = 480,
): VideoPresentation {
  source.width = width;
  source.height = height;
  return {
    acquire: () => ({
      height,
      release,
      source,
      timeNs,
      width,
    }),
    height,
    live: true,
    timeNs,
    width,
  };
}
