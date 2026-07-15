/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * @vitest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture annotation event callbacks so tests can fire them directly. The
// `useFrameLabelsStream` mock is rebound per test so we can simulate "stream
// not ready".
const { annotationHandlers, getLabelMock, streamRef, sampleIdRef } = vi.hoisted(
  () => ({
    annotationHandlers: new Map<string, (payload: unknown) => void>(),
    getLabelMock: vi.fn(),
    streamRef: { current: null as unknown },
    sampleIdRef: { current: "sample-1" as string | null },
  }),
);

vi.mock("@fiftyone/annotation", () => ({
  useAnnotationEngine: () => ({ getLabel: getLabelMock }),
  useActiveSampleId: () => sampleIdRef.current,
  useAnnotationEventHandler: (
    event: string,
    cb: (payload: unknown) => void,
  ) => {
    annotationHandlers.set(event, cb);
  },
}));

vi.mock("@fiftyone/playback", () => ({
  frameAt: (time: number, fps: number) => Math.floor(time * fps) + 1,
}));

vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => streamRef.current,
}));

import { useFrameKeyframeState } from "./useFrameKeyframeState";

const fire = (event: string, payload: unknown) =>
  act(() => annotationHandlers.get(event)!(payload));

beforeEach(() => {
  annotationHandlers.clear();
  getLabelMock.mockReset();
  streamRef.current = {
    fps: 30,
    totalFrames: 100,
    labelsField: "detections",
  };
  sampleIdRef.current = "sample-1";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useFrameKeyframeState", () => {
  it("returns false with no selection", () => {
    const { result } = renderHook(() => useFrameKeyframeState([], 0));
    expect(result.current).toBe(false);
    expect(getLabelMock).not.toHaveBeenCalled();
  });

  it("returns false with multi-selection", () => {
    const { result } = renderHook(() => useFrameKeyframeState(["a", "b"], 0));
    expect(result.current).toBe(false);
    expect(getLabelMock).not.toHaveBeenCalled();
  });

  it("returns false when stream is not ready", () => {
    streamRef.current = null;
    const { result } = renderHook(() => useFrameKeyframeState(["a"], 0));
    expect(result.current).toBe(false);
  });

  it("returns true when the selected track has a keyframe at the playhead", () => {
    getLabelMock.mockReturnValue({ keyframe: true });
    const { result } = renderHook(() => useFrameKeyframeState(["a"], 0));
    expect(result.current).toBe(true);
    expect(getLabelMock).toHaveBeenCalledWith({
      sample: "sample-1",
      path: "frames.detections",
      instanceId: "a",
      frame: 1,
    });
  });

  it("returns false when the detection on this frame has keyframe=false", () => {
    getLabelMock.mockReturnValue({ keyframe: false });
    const { result } = renderHook(() => useFrameKeyframeState(["a"], 0));
    expect(result.current).toBe(false);
  });

  it("returns false when there is no detection at the frame", () => {
    getLabelMock.mockReturnValue(undefined);
    const { result } = renderHook(() => useFrameKeyframeState(["a"], 0));
    expect(result.current).toBe(false);
  });

  it("re-reads the engine on annotation:keyframeChanged", () => {
    getLabelMock.mockReturnValueOnce({ keyframe: false });
    const { result } = renderHook(() => useFrameKeyframeState(["a"], 0));
    expect(result.current).toBe(false);

    getLabelMock.mockReturnValue({ keyframe: true });
    fire("annotation:keyframeChanged", {});
    expect(result.current).toBe(true);
  });

  it("re-reads the engine on annotation:labelEdit", () => {
    getLabelMock.mockReturnValueOnce({ keyframe: true });
    const { result } = renderHook(() => useFrameKeyframeState(["a"], 0));
    expect(result.current).toBe(true);

    getLabelMock.mockReturnValue({ keyframe: false });
    fire("annotation:labelEdit", {});
    expect(result.current).toBe(false);
  });

  it("re-evaluates when selection / playhead changes", () => {
    getLabelMock.mockReturnValue({ keyframe: true });
    const { result, rerender } = renderHook(
      ({ ids, t }: { ids: string[]; t: number }) =>
        useFrameKeyframeState(ids, t),
      { initialProps: { ids: ["a"], t: 0 } },
    );
    expect(result.current).toBe(true);

    rerender({ ids: [], t: 0 });
    expect(result.current).toBe(false);
  });
});
