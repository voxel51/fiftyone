/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Tests for the synchronous, field-aware `useAutoInterpolate` handler: the
 * bracketing re-lerp (delegated to `useVideoPropagate`, carrying the changed
 * field path + the edit's undo key) and the Case C tail step-hold (geometry
 * held forward over the trailing filler when the LAST keyframe is edited).
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  annotationHandlers,
  propagate,
  updateLabel,
  transaction,
  getLabelImpl,
} = vi.hoisted(() => ({
  annotationHandlers: new Map<string, (payload: unknown) => void>(),
  propagate: vi.fn(),
  updateLabel: vi.fn(),
  transaction: vi.fn((fn: () => void) => fn()),
  // Mutable so individual tests swap in their own label table.
  getLabelImpl: {
    current: ({ frame }: { frame: number }) =>
      frame === 1 || frame === 3 ? { keyframe: true } : null,
  } as {
    current: (args: {
      frame: number;
    }) => { keyframe?: boolean; bounding_box?: number[] } | null;
  },
}));

vi.mock("@fiftyone/annotation", () => ({
  useAnnotationEventHandler: (
    event: string,
    cb: (payload: unknown) => void,
  ) => {
    annotationHandlers.set(event, cb);
  },
  useAnnotationEngine: () => ({
    getLabel: (args: { frame: number }) => getLabelImpl.current(args),
  }),
  useActiveSampleId: () => "sample-1",
  useSurfaceActions: () => ({ transaction, updateLabel }),
}));

const { streamRef } = vi.hoisted(() => ({
  streamRef: {
    current: { labelsField: "detections", totalFrames: 3 } as unknown,
  },
}));

vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => streamRef.current,
}));

vi.mock("./useVideoPropagate", () => ({
  useVideoPropagate: () => propagate,
}));

import { useAutoInterpolate } from "./useAutoInterpolate";

const fireKeyframeChanged = (payload: unknown) =>
  act(() => annotationHandlers.get("annotation:keyframeChanged")!(payload));

beforeEach(() => {
  annotationHandlers.clear();
  propagate.mockReset();
  updateLabel.mockReset();
  transaction.mockClear();
  streamRef.current = { labelsField: "detections", totalFrames: 3 };
  getLabelImpl.current = ({ frame }: { frame: number }) =>
    frame === 1 || frame === 3 ? { keyframe: true } : null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAutoInterpolate (re-lerp)", () => {
  it("re-lerps both bracketing segments on a middle keyframe edit, threading the field path and undo key", () => {
    renderHook(() => useAutoInterpolate());

    fireKeyframeChanged({
      trackId: "t1",
      instanceId: "i1",
      frame: 2,
      kind: "set",
      path: "frames.detections",
      undoKey: "g1",
    });

    expect(propagate).toHaveBeenCalledTimes(2);
    expect(propagate).toHaveBeenNthCalledWith(
      1,
      "i1",
      1,
      2,
      "linear",
      "g1",
      "frames.detections",
    );
    expect(propagate).toHaveBeenNthCalledWith(
      2,
      "i1",
      2,
      3,
      "linear",
      "g1",
      "frames.detections",
    );
    // A next keyframe exists (frame 3) — no tail step-hold.
    expect(updateLabel).not.toHaveBeenCalled();
  });

  it("falls back to the primary field path when the payload omits one", () => {
    renderHook(() => useAutoInterpolate());

    fireKeyframeChanged({
      trackId: "t1",
      instanceId: "i1",
      frame: 2,
      kind: "set",
    });

    expect(propagate).toHaveBeenNthCalledWith(
      1,
      "i1",
      1,
      2,
      "linear",
      undefined,
      "frames.detections",
    );
  });

  it("is a no-op without a stream", () => {
    streamRef.current = null;
    renderHook(() => useAutoInterpolate());

    fireKeyframeChanged({
      trackId: "t1",
      instanceId: "i1",
      frame: 2,
      kind: "set",
    });

    expect(propagate).not.toHaveBeenCalled();
    expect(updateLabel).not.toHaveBeenCalled();
  });
});

describe("useAutoInterpolate (Case C — tail step-hold)", () => {
  it("step-holds non-keyframe filler after the edited last keyframe, coalesced under the edit's undo key", () => {
    // 5 frames: keyframes at 1 and 3 (3 is the last keyframe); 4 and 5 are
    // non-keyframe filler with stale geometry.
    streamRef.current = { labelsField: "detections", totalFrames: 5 };
    getLabelImpl.current = ({ frame }: { frame: number }) => {
      if (frame === 1) return { keyframe: true, bounding_box: [0, 0, 1, 1] };
      if (frame === 3)
        return { keyframe: true, bounding_box: [0.5, 0.5, 0.2, 0.2] };
      if (frame === 4)
        return { keyframe: false, bounding_box: [0.9, 0.9, 0.1, 0.1] };
      if (frame === 5)
        return { keyframe: false, bounding_box: [0.95, 0.95, 0.1, 0.1] };
      return null;
    };

    renderHook(() => useAutoInterpolate());

    fireKeyframeChanged({
      trackId: "t1",
      instanceId: "i1",
      frame: 3,
      kind: "set",
      path: "frames.detections",
      undoKey: "g1",
    });

    // Backward bracketing interp (1→3) runs; forward is a no-op (no next KF).
    expect(propagate).toHaveBeenCalledTimes(1);
    expect(propagate).toHaveBeenCalledWith(
      "i1",
      1,
      3,
      "linear",
      "g1",
      "frames.detections",
    );

    // Tail step-hold: frames 4 and 5 adopt the anchor geometry, keyframe false.
    expect(updateLabel).toHaveBeenCalledTimes(2);
    expect(updateLabel).toHaveBeenNthCalledWith(
      1,
      { path: "frames.detections", instanceId: "i1", frame: 4 },
      { bounding_box: [0.5, 0.5, 0.2, 0.2], keyframe: false },
    );
    expect(updateLabel).toHaveBeenNthCalledWith(
      2,
      { path: "frames.detections", instanceId: "i1", frame: 5 },
      { bounding_box: [0.5, 0.5, 0.2, 0.2], keyframe: false },
    );
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      undoKey: "g1",
    });
  });

  it("step-holds all subsequent frames on a single-keyframe track", () => {
    streamRef.current = { labelsField: "detections", totalFrames: 3 };
    getLabelImpl.current = ({ frame }: { frame: number }) => {
      if (frame === 1)
        return { keyframe: true, bounding_box: [0, 0, 0.5, 0.5] };
      if (frame === 2)
        return { keyframe: false, bounding_box: [0.7, 0.7, 0.1, 0.1] };
      if (frame === 3)
        return { keyframe: false, bounding_box: [0.8, 0.8, 0.1, 0.1] };
      return null;
    };

    renderHook(() => useAutoInterpolate());

    fireKeyframeChanged({
      trackId: "t1",
      instanceId: "i1",
      frame: 1,
      kind: "set",
      path: "frames.detections",
    });

    // No bracketing keyframes on either side → no interp.
    expect(propagate).not.toHaveBeenCalled();
    expect(updateLabel).toHaveBeenCalledTimes(2);
    expect(updateLabel).toHaveBeenNthCalledWith(
      1,
      { path: "frames.detections", instanceId: "i1", frame: 2 },
      { bounding_box: [0, 0, 0.5, 0.5], keyframe: false },
    );
  });

  it("does not step-hold a non-detection anchor (no bounding_box)", () => {
    // A polyline-style track: keyframe present but no bbox to hold forward.
    streamRef.current = { labelsField: "polylines", totalFrames: 3 };
    getLabelImpl.current = ({ frame }: { frame: number }) => {
      if (frame === 1) return { keyframe: true, points: [[0, 0]] } as never;
      if (frame === 2) return { keyframe: false, points: [[1, 1]] } as never;
      return null;
    };

    renderHook(() => useAutoInterpolate());

    fireKeyframeChanged({
      trackId: "t1",
      instanceId: "i1",
      frame: 1,
      kind: "set",
      path: "frames.polylines",
    });

    expect(updateLabel).not.toHaveBeenCalled();
  });

  it("does not step-hold on a keyframe removal", () => {
    streamRef.current = { labelsField: "detections", totalFrames: 3 };
    getLabelImpl.current = ({ frame }: { frame: number }) => {
      if (frame === 1) return { keyframe: true, bounding_box: [0, 0, 1, 1] };
      if (frame === 2)
        return { keyframe: false, bounding_box: [0.5, 0.5, 0.1, 0.1] };
      return null;
    };

    renderHook(() => useAutoInterpolate());

    fireKeyframeChanged({
      trackId: "t1",
      instanceId: "i1",
      frame: 1,
      kind: "removed",
      path: "frames.detections",
    });

    expect(updateLabel).not.toHaveBeenCalled();
  });
});
