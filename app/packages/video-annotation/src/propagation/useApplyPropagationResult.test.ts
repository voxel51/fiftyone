/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockActions = {
  transaction: vi.fn((fn: () => unknown) => fn()),
  updateLabel: vi.fn(),
};

const h = vi.hoisted(() => ({ stream: null as unknown }));

vi.mock("@fiftyone/annotation", () => ({
  useAnnotationEngine: () => ({}),
  useSurfaceActions: () => mockActions,
}));

vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => h.stream,
}));

import {
  useApplyPropagatedDetection,
  useApplyPropagationResult,
} from "./useApplyPropagationResult";

const PATH = "frames.detections";

beforeEach(() => {
  h.stream = { labelsField: "detections" };
  vi.clearAllMocks();
});

describe("useApplyPropagatedDetection", () => {
  it("writes the detection at its frame, addressed by instance._id, identity stripped", () => {
    const { result } = renderHook(() => useApplyPropagatedDetection());

    result.current(3, {
      _id: "minted",
      instance: { _id: "inst-1" },
      bounding_box: [0, 0, 1, 1],
    } as never);

    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "inst-1", frame: 3 },
      { bounding_box: [0, 0, 1, 1] },
    );
  });

  it("coalesces a streaming run under a shared undoKey", () => {
    const { result } = renderHook(() => useApplyPropagatedDetection());

    result.current(
      4,
      {
        _id: "m",
        instance: { _id: "inst-1" },
        bounding_box: [0, 0, 1, 1],
      } as never,
      { undoKey: "propagate:1" },
    );

    expect(mockActions.transaction).toHaveBeenCalledWith(expect.any(Function), {
      undoKey: "propagate:1",
    });
  });

  it("writes to a non-primary frame field when given its path", () => {
    const { result } = renderHook(() => useApplyPropagatedDetection());

    result.current(
      3,
      {
        _id: "m",
        instance: { _id: "inst-1" },
        bounding_box: [0, 0, 1, 1],
      } as never,
      { path: "frames.polylines" },
    );

    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: "frames.polylines", instanceId: "inst-1", frame: 3 },
      { bounding_box: [0, 0, 1, 1] },
    );
  });

  it("falls back to the doc _id when the detection has no instance", () => {
    const { result } = renderHook(() => useApplyPropagatedDetection());

    result.current(2, { _id: "doc-2", bounding_box: [0, 0, 1, 1] } as never);

    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "doc-2", frame: 2 },
      { bounding_box: [0, 0, 1, 1] },
    );
  });

  it("is a no-op when no stream is mounted", () => {
    h.stream = null;
    const { result } = renderHook(() => useApplyPropagatedDetection());

    expect(() =>
      result.current(1, { instance: { _id: "x" } } as never),
    ).not.toThrow();
    expect(mockActions.updateLabel).not.toHaveBeenCalled();
  });
});

describe("useApplyPropagationResult", () => {
  it("writes each per-frame detection from a sync result in one transaction", () => {
    const { result } = renderHook(() => useApplyPropagationResult());

    result.current({
      type: "sync",
      response: {
        perFrame: [
          { frameNumber: 2, detection: { _id: "a", instance: { _id: "i" } } },
          { frameNumber: 3, detection: { _id: "b", instance: { _id: "i" } } },
        ],
      },
    } as never);

    // the outer batch transaction plus each writer's nested transaction
    expect(mockActions.updateLabel).toHaveBeenCalledTimes(2);
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "i", frame: 2 },
      {},
    );
  });

  it("routes a sync result's per-frame writes to the given non-primary field", () => {
    const { result } = renderHook(() => useApplyPropagationResult());

    result.current(
      {
        type: "sync",
        response: {
          perFrame: [
            { frameNumber: 2, detection: { _id: "a", instance: { _id: "i" } } },
          ],
        },
      } as never,
      { path: "frames.polylines" },
    );

    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: "frames.polylines", instanceId: "i", frame: 2 },
      {},
    );
  });

  it("ignores a non-sync (streaming) result", () => {
    const { result } = renderHook(() => useApplyPropagationResult());

    result.current({ type: "async" } as never);

    expect(mockActions.updateLabel).not.toHaveBeenCalled();
  });
});
