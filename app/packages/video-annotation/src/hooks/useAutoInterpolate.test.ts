/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Focused tests for the microtask-coalescing dedup in `useAutoInterpolate`.
 * The interp logic itself (segment resolution, engine reads) is covered by
 * `resolveSegmentsToRepropagate` unit tests and the integration tests for the
 * full bridge — here we only assert that bursts collapse to a single
 * interp pass per unique `(instanceId, frame, kind)` key per microtask tick,
 * and that pending events are dropped on unmount.
 *
 * Setup: the mocked engine reports keyframes at frames 1 and 3, the stream
 * has `totalFrames: 3`, and a "set" event at frame 2 yields two bracketing
 * segments — so EACH unique drain calls `propagate` exactly twice. Dedup
 * collapses duplicate keys into one drain (2 calls); distinct keys produce
 * separate drains (2 calls each).
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { annotationHandlers, propagate, updateLabel, getLabelImpl } = vi.hoisted(
  () => ({
    annotationHandlers: new Map<string, (payload: unknown) => void>(),
    propagate: vi.fn(),
    updateLabel: vi.fn(),
    // Mutable so individual tests can swap in their own label table. Default:
    // Cases A/B microtask-coalescing setup — keyframes at 1 and 3, totalFrames 3.
    getLabelImpl: {
      current: ({ frame }: { frame: number }) =>
        frame === 1 || frame === 3 ? { keyframe: true } : null,
    } as {
      current: (args: {
        frame: number;
      }) => { keyframe?: boolean; bounding_box?: number[] } | null;
    },
  }),
);

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
  useSurfaceActions: () => ({
    transaction: (fn: () => void) => fn(),
    updateLabel,
  }),
}));

const { streamRef } = vi.hoisted(() => ({
  streamRef: {
    current: { labelsField: "detections", totalFrames: 3 },
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

// Yield once past the microtask boundary so the drain has run.
const flushMicrotasks = () =>
  act(() => new Promise<void>((r) => queueMicrotask(r)));

beforeEach(() => {
  annotationHandlers.clear();
  propagate.mockReset();
  updateLabel.mockReset();
  streamRef.current = { labelsField: "detections", totalFrames: 3 };
  getLabelImpl.current = ({ frame }: { frame: number }) =>
    frame === 1 || frame === 3 ? { keyframe: true } : null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAutoInterpolate (microtask coalescing)", () => {
  it("collapses duplicate (instanceId, frame, kind) events into one drain", async () => {
    renderHook(() => useAutoInterpolate());

    // Three events, all identical keys — must drain ONCE → 2 propagate calls
    // (one per bracketing segment [1,2] and [2,3]).
    fireKeyframeChanged({
      trackId: "t1",
      instanceId: "i1",
      frame: 2,
      kind: "set",
    });
    fireKeyframeChanged({
      trackId: "t1",
      instanceId: "i1",
      frame: 2,
      kind: "set",
    });
    fireKeyframeChanged({
      trackId: "t1",
      instanceId: "i1",
      frame: 2,
      kind: "set",
    });

    // Before the microtask boundary, nothing has run.
    expect(propagate).not.toHaveBeenCalled();

    await flushMicrotasks();

    // One drain × two segments = two propagate calls.
    expect(propagate).toHaveBeenCalledTimes(2);
  });

  it("runs once per unique key when distinct events fire in one tick", async () => {
    renderHook(() => useAutoInterpolate());

    // Two distinct instanceIds → two drains → 2 × 2 = 4 propagate calls.
    fireKeyframeChanged({
      trackId: "t1",
      instanceId: "i1",
      frame: 2,
      kind: "set",
    });
    fireKeyframeChanged({
      trackId: "t2",
      instanceId: "i2",
      frame: 2,
      kind: "set",
    });

    await flushMicrotasks();

    expect(propagate).toHaveBeenCalledTimes(4);
  });

  it("does not run tail step-hold when a next keyframe exists (middle keyframe edit)", async () => {
    // Default fixture: keyframes at 1 and 3, totalFrames 3. A "set" event at
    // frame 2 has a next keyframe (3) — only the existing bracketing interp
    // should run; no tail step-hold writes.
    renderHook(() => useAutoInterpolate());

    fireKeyframeChanged({
      trackId: "t1",
      instanceId: "i1",
      frame: 2,
      kind: "set",
    });

    await flushMicrotasks();

    expect(propagate).toHaveBeenCalledTimes(2);
    expect(updateLabel).not.toHaveBeenCalled();
  });

  it("drops pending events when the hook unmounts before the drain", async () => {
    const { unmount } = renderHook(() => useAutoInterpolate());

    fireKeyframeChanged({
      trackId: "t1",
      instanceId: "i1",
      frame: 2,
      kind: "set",
    });

    // Unmount synchronously, before the queued microtask runs.
    unmount();

    await flushMicrotasks();

    expect(propagate).not.toHaveBeenCalled();
  });
});

/**
 * Case C — tail step-hold.
 *
 * Tracks have an intentional asymmetry: the first frame is auto-keyframed,
 * the last frame is not. When the user edits the LAST keyframe, the trailing
 * non-keyframe filler must adopt the new geometry (step-hold), otherwise the
 * frame right after the keyframe visibly jumps to the OLD geometry.
 */
describe("useAutoInterpolate (Case C — tail step-hold)", () => {
  it("step-holds non-keyframe filler after the edited last keyframe", async () => {
    // Track of 5 frames: keyframes at 1 and 3 (3 is the last keyframe);
    // frames 4 and 5 are non-keyframe filler with old geometry.
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
    });

    await flushMicrotasks();

    // Backward bracketing interp (1→3) runs. Forward is a no-op (no next KF).
    expect(propagate).toHaveBeenCalledTimes(1);
    expect(propagate).toHaveBeenCalledWith("i1", 1, 3, "linear");

    // Tail step-hold: frames 4 and 5 get the anchor geometry, keyframe stays false.
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
  });

  it("step-holds all subsequent frames on a single-keyframe track", async () => {
    // Single keyframe at frame 1, filler at 2 and 3.
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
    });

    await flushMicrotasks();

    // No bracketing keyframes on either side → no interp calls.
    expect(propagate).not.toHaveBeenCalled();

    // Tail step-hold rewrites both filler frames.
    expect(updateLabel).toHaveBeenCalledTimes(2);
    expect(updateLabel).toHaveBeenNthCalledWith(
      1,
      { path: "frames.detections", instanceId: "i1", frame: 2 },
      { bounding_box: [0, 0, 0.5, 0.5], keyframe: false },
    );
    expect(updateLabel).toHaveBeenNthCalledWith(
      2,
      { path: "frames.detections", instanceId: "i1", frame: 3 },
      { bounding_box: [0, 0, 0.5, 0.5], keyframe: false },
    );
  });
});
