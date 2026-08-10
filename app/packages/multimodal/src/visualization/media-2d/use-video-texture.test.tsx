import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { VideoPresentation } from "../../video/types";
import { setVisualizationCostObserver } from "../../observability/visualization-cost";
import {
  useVideoTexture,
  VIDEO_TEXTURE_RETIRE_FALLBACK_MS,
} from "./use-video-texture";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  setVisualizationCostObserver(null);
});

describe("useVideoTexture", () => {
  it("clears a disposed presentation handle and releases its lease", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const release = vi.fn();
    const observeCost = vi.fn();
    setVisualizationCostObserver(observeCost);
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
    expect(observeCost).toHaveBeenCalledWith(
      expect.objectContaining({
        declaredGpuBytesDelta: 640 * 480 * 4,
        operation: "image-texture-lease",
        stage: "resource-allocate",
      }),
    );
    expect(observeCost).toHaveBeenCalledWith(
      expect.objectContaining({
        declaredGpuBytesDelta: -(640 * 480 * 4),
        operation: "image-texture-lease",
        stage: "resource-release",
      }),
    );
  });

  it("replaces the renderer texture and retires the prior lease", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const firstRelease = vi.fn();
    const secondRelease = vi.fn();
    const first = presentation(1n, firstRelease);
    const second = presentation(2n, secondRelease);
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
    expect(firstRelease).toHaveBeenCalledOnce();
    expect(secondRelease).not.toHaveBeenCalled();
    expect(onLoaded).toHaveBeenLastCalledWith(result.current);
  });

  it("retires through the timeout when animation frames are paused", async () => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    const release = vi.fn();
    const { rerender } = renderHook(
      ({ value }: { readonly value: VideoPresentation | null }) =>
        useVideoTexture(value),
      {
        initialProps: {
          value: presentation(1n, release) as VideoPresentation | null,
        },
      },
    );

    rerender({ value: null });
    expect(release).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(VIDEO_TEXTURE_RETIRE_FALLBACK_MS);
    expect(release).toHaveBeenCalledOnce();
  });
});

function presentation(timeNs: bigint, release: () => void): VideoPresentation {
  return {
    acquire: () => ({
      height: 480,
      release,
      source: document.createElement("canvas"),
      timeNs,
      width: 640,
    }),
    height: 480,
    live: true,
    timeNs,
    width: 640,
  };
}
