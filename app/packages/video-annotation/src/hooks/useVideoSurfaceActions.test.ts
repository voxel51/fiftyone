/**
 * The engine-native video actions: track-id → instanceId mapping, per-frame ref
 * stamping, one-transaction-per-op grouping, keyframe/track notification events,
 * and TD ops routed sample-level (no frame). Engine correctness lives in the
 * store/engine tests; here we assert the hook emits the right ops.
 */

import { renderHook } from "@testing-library/react";
import type { LabelData } from "@fiftyone/utilities";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useVideoSurfaceActions } from "./useVideoSurfaceActions";

const SAMPLE = "v";
const PATH = "frames.detections";

// per-frame engine truth the hook reads through `engine.getLabel`
let frameData: Record<number, Record<string, LabelData>>;

const mockEngine = {
  getLabel: ({ instanceId, frame }: { instanceId: string; frame?: number }) =>
    frame != null ? frameData[frame]?.[instanceId] : undefined,
};

const mockActions = {
  transaction: vi.fn((fn: () => unknown) => fn()),
  updateLabel: vi.fn(),
  deleteLabel: vi.fn(),
  createLabel: vi.fn(() => ({
    sample: SAMPLE,
    path: "events",
    instanceId: "new-td",
  })),
};

const mockBus = { dispatch: vi.fn() };
const mockStream = { fps: 10, totalFrames: 5, labelsField: "detections" };

vi.mock("@fiftyone/annotation", () => ({
  useAnnotationEngine: () => mockEngine,
  useSurfaceActions: () => mockActions,
  useActiveSampleId: () => SAMPLE,
  useAnnotationEventBus: () => mockBus,
}));

vi.mock("@fiftyone/playback", () => ({ frameAt: (time: number) => time }));

vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => mockStream,
}));

const det = (
  id: string,
  instanceId: string,
  over: Partial<LabelData> = {}
): LabelData => ({
  _id: id,
  _cls: "Detection",
  instance: { _id: instanceId, _cls: "Instance" },
  label: "x",
  bounding_box: [0, 0, 1, 1],
  ...over,
});

const render = () => renderHook(() => useVideoSurfaceActions()).result;

beforeEach(() => {
  frameData = {};
  vi.clearAllMocks();
});

describe("track ops", () => {
  it("markKeyframe toggles keyframe on the addressed frame and notifies", () => {
    frameData = {
      2: { A: det("d2", "A", { keyframe: false, propagation: { foo: 1 } }) },
    };

    render().current.markKeyframe(2, ["instance-A"]);

    expect(mockActions.transaction).toHaveBeenCalledTimes(1);
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "A", frame: 2 },
      { keyframe: true, propagation: null }
    );
    expect(mockBus.dispatch).toHaveBeenCalledWith(
      "annotation:keyframeChanged",
      {
        trackId: "instance-A",
        instanceId: "A",
        frame: 2,
        kind: "set",
      }
    );
  });

  it("markKeyframe skips a legacy track-<index> id (no engine identity)", () => {
    frameData = { 2: { A: det("d2", "A") } };

    render().current.markKeyframe(2, ["track-4"]);

    expect(mockActions.updateLabel).not.toHaveBeenCalled();
    expect(mockBus.dispatch).not.toHaveBeenCalled();
  });

  it("extendTrack fills target frames with the source content as non-keyframes", () => {
    frameData = {
      1: { A: det("d1", "A", { keyframe: true, confidence: 0.9 }) },
    };

    render().current.extendTrack("instance-A", 1, [2, 3, 99]);

    // 99 is out of range [1,5] and dropped; identity fields stripped from content
    expect(mockActions.updateLabel).toHaveBeenCalledTimes(2);
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "A", frame: 2 },
      {
        _cls: "Detection",
        label: "x",
        bounding_box: [0, 0, 1, 1],
        confidence: 0.9,
        keyframe: false,
      }
    );
  });

  it("trimTrack deletes only frames where the track is present", () => {
    frameData = { 2: { A: det("d2", "A") } };

    render().current.trimTrack("instance-A", [2, 3]);

    expect(mockActions.deleteLabel).toHaveBeenCalledTimes(1);
    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: PATH,
      instanceId: "A",
      frame: 2,
    });
  });

  it("shiftTrack deletes originals then re-lays content at frame+delta", () => {
    frameData = { 2: { A: det("d2", "A", { keyframe: true }) } };

    render().current.shiftTrack("instance-A", [2], 1);

    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: PATH,
      instanceId: "A",
      frame: 2,
    });
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "A", frame: 3 },
      {
        _cls: "Detection",
        label: "x",
        bounding_box: [0, 0, 1, 1],
        keyframe: true,
      }
    );
  });

  it("deleteTrack removes every frame it appears on and notifies", () => {
    frameData = { 1: { A: det("d1", "A") }, 4: { A: det("d4", "A") } };

    render().current.deleteTrack("instance-A");

    expect(mockActions.deleteLabel).toHaveBeenCalledTimes(2);
    expect(mockBus.dispatch).toHaveBeenCalledWith("annotation:trackDeleted", {
      trackId: "instance-A",
    });
  });

  it("updateTrackAttributes merges onto every frame", () => {
    frameData = { 1: { A: det("d1", "A") }, 3: { A: det("d3", "A") } };

    render().current.updateTrackAttributes("instance-A", { label: "car" });

    expect(mockActions.updateLabel).toHaveBeenCalledTimes(2);
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "A", frame: 1 },
      { label: "car" }
    );
  });
});

describe("temporal-detection ops", () => {
  it("createTemporalDetection mints a sample-level TD and returns its id", () => {
    const id = render().current.createTemporalDetection(
      "events",
      [3, 12],
      "speaking"
    );

    expect(id).toBe("new-td");
    expect(mockActions.createLabel).toHaveBeenCalledWith("events", {
      _cls: "TemporalDetection",
      support: [3, 12],
      tags: [],
      label: "speaking",
    });
  });

  it("editTemporalDetection updates by id with no frame", () => {
    render().current.editTemporalDetection("events", "t1", { support: [5, 9] });

    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: "events", instanceId: "t1" },
      { support: [5, 9] }
    );
  });

  it("deleteTemporalDetection deletes by id with no frame", () => {
    render().current.deleteTemporalDetection("events", "t1");

    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: "events",
      instanceId: "t1",
    });
  });
});
