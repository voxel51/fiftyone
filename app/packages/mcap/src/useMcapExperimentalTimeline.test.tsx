/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMultimodalExperimentalTimeline } from "./useMultimodalExperimentalTimeline";

const WINDOW_NS = 3_000_000_000;

function isBuffered(
  ranges: ReadonlyArray<readonly [number, number]>,
  timeNs: number
) {
  return ranges.some((range) => range[0] <= timeNs && range[1] >= timeNs);
}

describe("useMultimodalExperimentalTimeline", () => {
  let rafCallbacks: Map<number, FrameRequestCallback>;
  let nextRafId: number;
  let mockNow: number;

  beforeEach(() => {
    rafCallbacks = new Map();
    nextRafId = 1;
    mockNow = 0;

    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        const id = nextRafId++;
        rafCallbacks.set(id, callback);
        return id;
      })
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((id: number) => {
        rafCallbacks.delete(id);
      })
    );
    vi.spyOn(performance, "now").mockImplementation(() => mockNow);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function flushRaf(advanceMs = 1000) {
    mockNow += advanceMs;
    const callbacks = Array.from(rafCallbacks.values());
    rafCallbacks.clear();
    callbacks.forEach((callback) => callback(mockNow));
  }

  it("resumes from a hard miss and then keeps topping up ahead in the background", async () => {
    let bufferedRanges: Array<readonly [number, number]> = [[0, WINDOW_NS]];
    let resolveBlockingPrefetch: (() => void) | null = null;
    const prefetchRanges: Array<[number, number]> = [];
    const coverage = [0, 1_000_000_000, 2_000_000_000, 3_000_000_000];
    const onPrefetchRange = vi.fn((range: [number, number]) => {
      prefetchRanges.push(range);

      if (prefetchRanges.length === 1) {
        return new Promise<void>((resolve) => {
          resolveBlockingPrefetch = () => {
            bufferedRanges = [[0, WINDOW_NS]];
            resolve();
          };
        });
      }

      bufferedRanges = [[0, range[1]]];
      return Promise.resolve();
    });
    const onRenderTime = vi.fn();
    const getBufferReadiness = (timeNs: number) => {
      return isBuffered(bufferedRanges, timeNs) ? "ready" : "missing";
    };
    const getBufferedRanges = () => bufferedRanges;

    const { result } = renderHook(() =>
      useMultimodalExperimentalTimeline({
        name: "multimodal:scene-1",
        durationNs: 9_000_000_000,
        tickRate: 1,
        coverage,
        onPrefetchRange,
        onRenderTime,
        getBufferReadiness,
        getBufferedRanges,
        isBufferingCritical: true,
      })
    );

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    bufferedRanges = [];

    act(() => {
      result.current.play();
      flushRaf();
    });

    await waitFor(() => {
      expect(result.current.playState).toBe("buffering");
    });

    expect(prefetchRanges[0]).toEqual([0, WINDOW_NS]);

    await act(async () => {
      resolveBlockingPrefetch?.();
      await Promise.resolve();
    });

    act(() => {
      flushRaf();
    });

    await waitFor(() => {
      expect(result.current.playState).toBe("playing");
      expect(prefetchRanges).toHaveLength(2);
    });

    expect(prefetchRanges[1]).toEqual([WINDOW_NS + 1, 7_000_000_000]);
    expect(result.current.playState).toBe("playing");
  });

  it("clamps proactive top-up requests to the scene duration", async () => {
    let bufferedRanges: Array<readonly [number, number]> = [[0, WINDOW_NS]];
    const coverage = [0, 1_000_000_000, 2_000_000_000, 3_000_000_000];
    const onPrefetchRange = vi.fn((range: [number, number]) => {
      bufferedRanges = [[0, range[1]]];
      return Promise.resolve();
    });
    const onRenderTime = vi.fn();
    const getBufferReadiness = (timeNs: number) => {
      return isBuffered(bufferedRanges, timeNs) ? "ready" : "missing";
    };
    const getBufferedRanges = () => bufferedRanges;

    const { result } = renderHook(() =>
      useMultimodalExperimentalTimeline({
        name: "multimodal:scene-2",
        durationNs: 5_500_000_000,
        tickRate: 1,
        coverage,
        onPrefetchRange,
        onRenderTime,
        getBufferReadiness,
        getBufferedRanges,
        isBufferingCritical: true,
      })
    );

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    act(() => {
      result.current.play();
      flushRaf();
    });

    await waitFor(() => {
      expect(onPrefetchRange).toHaveBeenCalledWith([
        WINDOW_NS + 1,
        5_500_000_000,
      ]);
    });

    expect(result.current.playState).toBe("playing");
  });

  it("updates the exported current time while scrubbing by percentage", async () => {
    const durationNs = 10_000_000_000;
    const targetTimeNs = durationNs / 2;
    const coverage = [0, targetTimeNs, durationNs];
    const onPrefetchRange = vi.fn(async () => {});
    const onPreviewTime = vi.fn();
    const onRenderTime = vi.fn();

    const { result } = renderHook(() =>
      useMultimodalExperimentalTimeline({
        name: "multimodal:scene-3",
        durationNs,
        tickRate: 1,
        coverage,
        onPrefetchRange,
        onPreviewTime,
        onRenderTime,
      })
    );

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    act(() => {
      result.current.notifySeekStart();
    });

    await act(async () => {
      await result.current.seekToPercentage(50);
    });

    expect(result.current.currentTimeNs).toBe(targetTimeNs);
    expect(onPreviewTime).toHaveBeenCalledTimes(1);
    expect(onPreviewTime).toHaveBeenCalledWith(
      targetTimeNs,
      expect.objectContaining({
        reason: "scrub-preview",
      })
    );
    expect(onRenderTime).not.toHaveBeenCalled();
  });
});
