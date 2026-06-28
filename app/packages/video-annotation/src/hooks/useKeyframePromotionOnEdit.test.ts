/**
 * The bridge's `onEditCommit` callback: after a box drag / resize commits,
 * promote the touched frame to a keyframe and dispatch `keyframeChanged` so the
 * auto-interpolate hook re-lerps. Bbox-only, frame-scoped, and folded into the
 * edit's undo unit via the commit's `undoKey`.
 */

import { renderHook } from "@testing-library/react";
import type { LabelData } from "@fiftyone/utilities";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useKeyframePromotionOnEdit } from "./useKeyframePromotionOnEdit";

const SAMPLE = "v";
const PATH = "frames.detections";
const FRAME = 3;

let frameData: Record<string, LabelData>;

const mockEngine = {
  getLabel: ({ instanceId }: { instanceId: string }) => frameData[instanceId],
  transaction: vi.fn((fn: () => unknown, _opts?: { undoKey?: string }) => fn()),
  updateLabel: vi.fn(),
};

const mockBus = { dispatch: vi.fn() };

vi.mock("@fiftyone/annotation", () => ({
  FRAMES_PREFIX: "frames.",
  useAnnotationEngine: () => mockEngine,
  useActiveSampleId: () => SAMPLE,
  useAnnotationEventBus: () => mockBus,
}));

vi.mock("../state/useCurrentFrame", () => ({
  useCurrentFrameGetter: () => () => FRAME,
}));

const det = (over: Partial<LabelData> = {}): LabelData =>
  ({
    _id: "d",
    _cls: "Detection",
    instance: { _id: "A", _cls: "Instance" },
    label: "x",
    bounding_box: [0, 0, 1, 1],
    ...over,
  }) as LabelData;

const render = () =>
  renderHook(() => useKeyframePromotionOnEdit()).result.current;

beforeEach(() => {
  frameData = {};
  vi.clearAllMocks();
});

describe("useKeyframePromotionOnEdit", () => {
  it("promotes a non-keyframe frame and re-lerps, folded into the edit's undo unit", () => {
    frameData = { A: det({ keyframe: false, propagation: { foo: 1 } }) };

    render()("A", PATH, "gesture:1");

    expect(mockEngine.transaction).toHaveBeenCalledTimes(1);
    expect(mockEngine.transaction.mock.calls[0][1]).toEqual({
      undoKey: "gesture:1",
    });
    expect(mockEngine.updateLabel).toHaveBeenCalledWith(
      { sample: SAMPLE, path: PATH, instanceId: "A", frame: FRAME },
      { keyframe: true, propagation: null },
    );
    expect(mockBus.dispatch).toHaveBeenCalledWith(
      "annotation:keyframeChanged",
      {
        trackId: "instance-A",
        instanceId: "A",
        frame: FRAME,
        kind: "set",
        undoKey: "gesture:1",
      },
    );
  });

  it("re-lerps without a promotion write when the frame is already a keyframe", () => {
    frameData = { A: det({ keyframe: true }) };

    render()("A", PATH, "gesture:2");

    expect(mockEngine.transaction).not.toHaveBeenCalled();
    expect(mockEngine.updateLabel).not.toHaveBeenCalled();
    expect(mockBus.dispatch).toHaveBeenCalledWith(
      "annotation:keyframeChanged",
      expect.objectContaining({ instanceId: "A", kind: "set" }),
    );
  });

  it("ignores a sample-level (frame-less) path — temporal detections have no keyframe", () => {
    frameData = { A: det({ keyframe: false }) };

    render()("A", "events", "gesture:3");

    expect(mockEngine.updateLabel).not.toHaveBeenCalled();
    expect(mockBus.dispatch).not.toHaveBeenCalled();
  });

  it("ignores a label without a bounding box — the lerp interpolates bbox only", () => {
    frameData = {
      A: det({ keyframe: false, bounding_box: undefined }),
    };

    render()("A", PATH, "gesture:4");

    expect(mockEngine.updateLabel).not.toHaveBeenCalled();
    expect(mockBus.dispatch).not.toHaveBeenCalled();
  });

  it("no-ops when no label exists at the ref", () => {
    render()("missing", PATH, "gesture:5");

    expect(mockEngine.updateLabel).not.toHaveBeenCalled();
    expect(mockBus.dispatch).not.toHaveBeenCalled();
  });
});
