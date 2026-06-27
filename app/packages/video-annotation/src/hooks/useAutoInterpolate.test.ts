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

const { annotationHandlers, propagate } = vi.hoisted(() => ({
  annotationHandlers: new Map<string, (payload: unknown) => void>(),
  propagate: vi.fn(),
}));

vi.mock("@fiftyone/annotation", () => ({
  useAnnotationEventHandler: (
    event: string,
    cb: (payload: unknown) => void,
  ) => {
    annotationHandlers.set(event, cb);
  },
  useAnnotationEngine: () => ({
    // Keyframes at frames 1 and 3 — a "set" event at frame 2 brackets both.
    getLabel: ({ frame }: { frame: number }) =>
      frame === 1 || frame === 3 ? { keyframe: true } : null,
  }),
  useActiveSampleId: () => "sample-1",
}));

vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => ({ labelsField: "detections", totalFrames: 3 }),
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
