/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Tests for `useVideoPropagate`'s dispatch: which linear agent a field's label
 * type resolves to, and what keyframe shape that agent is handed. Detections
 * resolve to the bbox agent, polylines to the polyline agent (carrying `points`,
 * which the bbox converter drops), and everything else to neither.
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const emptyResult = async () => ({
  labelId: "instance-1",
  type: "sync",
  response: { perFrame: [] },
});

// One spy per registered agent: which spy ran IS the dispatch assertion.
const { inferBox, inferPolyline, applyPropagation, labelTypeRef } = vi.hoisted(
  () => ({
    inferBox: vi.fn(async () => ({
      labelId: "instance-1",
      type: "sync",
      response: { perFrame: [] },
    })),
    inferPolyline: vi.fn(async () => ({
      labelId: "instance-1",
      type: "sync",
      response: { perFrame: [] },
    })),
    applyPropagation: vi.fn(),
    labelTypeRef: { current: "Detections" },
  }),
);

const LEFT = {
  _id: "left",
  keyframe: true,
  bounding_box: [0.1, 0.1, 0.2, 0.2],
  points: [
    [
      [0.1, 0.1],
      [0.3, 0.1],
      [0.3, 0.3],
    ],
  ],
  label: "vehicle",
  index: 2,
};
const RIGHT = { ...LEFT, _id: "right" };

vi.mock("@fiftyone/annotation", () => ({
  AgentTaskType: { PROPAGATE: "propagate" },
  useActiveSampleId: () => "sample-1",
  useSampleDescriptor: () => ({ id: "sample-1" }),
  useAgentRegistry: () => ({
    listAgents: async () => [
      { id: "propagate-linear", agent: { infer: inferBox } },
      { id: "propagate-linear-polyline", agent: { infer: inferPolyline } },
    ],
    register: vi.fn(),
  }),
  useAnnotationEngine: () => ({
    getLabelType: () => labelTypeRef.current,
    getLabel: ({ frame }: { frame: number }) =>
      frame === 10 ? LEFT : frame === 20 ? RIGHT : { keyframe: false },
  }),
}));

vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => ({
    labelsField: "polylines",
    fps: 30,
    totalFrames: 40,
  }),
}));

vi.mock("../streams/imaVidImageStreamHandle", () => ({
  useImaVidImageStream: () => ({}),
}));

vi.mock("../propagation/useApplyPropagationResult", () => ({
  useApplyPropagationResult: () => applyPropagation,
  useApplyPropagatedDetection: () => vi.fn(),
}));

vi.mock("../state/videoAnnotationStatus", () => ({
  useVideoAnnotationStatus: () => ({ begin: vi.fn(), end: vi.fn() }),
}));

vi.mock("../components/PropagationStatusItem", () => ({
  PropagationStatusItem: () => null,
}));

import { useVideoPropagate } from "./useVideoPropagate";

const propagateOnce = async () => {
  const { result } = renderHook(() => useVideoPropagate());
  // (instanceId, fromFrame, toFrame, method)
  return result.current("instance-1", 10, 20, "linear");
};

describe("useVideoPropagate — linear agent dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    labelTypeRef.current = "Detections";
  });

  it("resolves a detection field to the bbox agent", async () => {
    await propagateOnce();

    expect(inferBox).toHaveBeenCalledTimes(1);
    expect(inferPolyline).not.toHaveBeenCalled();
  });

  it("resolves a polyline field to the polyline agent", async () => {
    labelTypeRef.current = "Polylines";

    await propagateOnce();

    expect(inferPolyline).toHaveBeenCalledTimes(1);
    expect(inferBox).not.toHaveBeenCalled();
  });

  it("resolves the singular Polyline type too", async () => {
    labelTypeRef.current = "Polyline";

    await propagateOnce();

    expect(inferPolyline).toHaveBeenCalledTimes(1);
  });

  it("hands the polyline agent keyframes carrying `points`", async () => {
    // The bbox path converts through `toSyntheticBox`, which drops `points`
    // entirely — feeding that to the polyline agent would interpolate nothing.
    labelTypeRef.current = "Polylines";

    await propagateOnce();

    const context = inferPolyline.mock.calls[0][0] as unknown as {
      parentKeyframes: { points?: unknown; closed?: boolean }[];
      fromFrame: number;
      toFrame: number;
      instanceId: string;
    };
    expect(context.parentKeyframes).toHaveLength(2);
    expect(context.parentKeyframes[0].points).toEqual(LEFT.points);
    expect(context.parentKeyframes[1].points).toEqual(RIGHT.points);
    expect(context.fromFrame).toBe(10);
    expect(context.toFrame).toBe(20);
    expect(context.instanceId).toBe("instance-1");
  });

  it("still hands the bbox agent a bounding box", async () => {
    await propagateOnce();

    const context = inferBox.mock.calls[0][0] as unknown as {
      parentKeyframes: { bounding_box?: number[] }[];
    };
    expect(context.parentKeyframes[0].bounding_box).toEqual(LEFT.bounding_box);
  });

  it("refuses SAM2 propagation on a polyline field", async () => {
    // A polyline field resolves a linear agent, so it clears the dispatch gate —
    // but SAM2 prompts from a bounding box the polyline doesn't have.
    labelTypeRef.current = "Polylines";

    const { result } = renderHook(() => useVideoPropagate());
    expect(await result.current("instance-1", 10, 20, "sam2")).toBe(false);
    expect(inferPolyline).not.toHaveBeenCalled();
    expect(inferBox).not.toHaveBeenCalled();
  });

  it.each(["Classifications", "Keypoints", "TemporalDetection"])(
    "leaves %s fields alone — nothing this pipeline can lerp",
    async (type) => {
      labelTypeRef.current = type;

      expect(await propagateOnce()).toBe(false);
      expect(inferBox).not.toHaveBeenCalled();
      expect(inferPolyline).not.toHaveBeenCalled();
    },
  );
});
