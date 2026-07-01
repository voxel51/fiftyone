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
// active interaction refs the hook reads to resolve a selected track's field
let activeRefs: { instanceId: string; path: string }[];

const mockEngine = {
  getLabel: ({ instanceId, frame }: { instanceId: string; frame?: number }) =>
    frame != null ? frameData[frame]?.[instanceId] : undefined,
  mintInstanceId: vi.fn(() => "NEW"),
  mintGestureId: vi.fn(() => "gesture:1"),
  interaction: { getActive: () => activeRefs },
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
  over: Partial<LabelData> = {},
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
  activeRefs = [];
  vi.clearAllMocks();
});

describe("track ops", () => {
  it("markKeyframe toggles keyframe on the addressed frame and notifies", () => {
    // Legacy data may still carry a `propagation` blob; markKeyframe must NOT
    // try to clear it with `propagation: null` (that null is the poison).
    frameData = {
      2: { A: det("d2", "A", { keyframe: false, propagation: { foo: 1 } }) },
    };

    render().current.markKeyframe(2, ["instance-A"]);

    expect(mockActions.transaction).toHaveBeenCalledTimes(1);
    // Only `keyframe: true` is written — no `propagation: null`, which would
    // seed a null baseline that a later re-lerp diffs as a `replace` over a
    // server-absent path (the frame-patch error).
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "A", frame: 2 },
      { keyframe: true },
    );
    expect(mockBus.dispatch).toHaveBeenCalledWith(
      "annotation:keyframeChanged",
      {
        trackId: "instance-A",
        instanceId: "A",
        frame: 2,
        kind: "set",
        path: PATH,
        undoKey: "gesture:1",
      },
    );
  });

  it("markKeyframe runs its toggle + re-lerp under one gesture key", () => {
    frameData = { 2: { A: det("d2", "A", { keyframe: false }) } };

    render().current.markKeyframe(2, ["instance-A"]);

    // the toggle transaction carries the minted key so the auto-interpolate
    // re-lerp coalesces into the same undo unit
    expect(mockActions.transaction).toHaveBeenCalledWith(expect.any(Function), {
      undoKey: "gesture:1",
    });
  });

  it("markKeyframe toggles on the track's own field when selected off-primary", () => {
    frameData = { 2: { A: det("d2", "A", { keyframe: false }) } };
    // the selected track's active ref points at a non-primary frame field
    activeRefs = [{ instanceId: "A", path: "frames.polylines" }];

    render().current.markKeyframe(2, ["instance-A"]);

    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: "frames.polylines", instanceId: "A", frame: 2 },
      { keyframe: true },
    );
    // the change event carries the field so the re-lerp targets it, not primary
    expect(mockBus.dispatch).toHaveBeenCalledWith(
      "annotation:keyframeChanged",
      expect.objectContaining({ instanceId: "A", path: "frames.polylines" }),
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
      },
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
      },
    );
  });

  // A polyline (or any non-primary-field track) is edited through the presence
  // bar against ITS OWN frames field — addressing the primary field would miss
  // the source and silently no-op (the drag snaps back).
  it("extendTrack fills a non-primary frame field when given its path", () => {
    frameData = { 1: { A: det("d1", "A", { keyframe: true }) } };

    render().current.extendTrack(
      "instance-A",
      1,
      [2],
      undefined,
      "frames.polylines",
    );

    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: "frames.polylines", instanceId: "A", frame: 2 },
      {
        _cls: "Detection",
        label: "x",
        bounding_box: [0, 0, 1, 1],
        keyframe: false,
      },
    );
  });

  it("trimTrack deletes from a non-primary frame field when given its path", () => {
    frameData = { 2: { A: det("d2", "A") } };

    render().current.trimTrack("instance-A", [2], "frames.polylines");

    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: "frames.polylines",
      instanceId: "A",
      frame: 2,
    });
  });

  it("shiftTrack re-lays content on a non-primary frame field when given its path", () => {
    frameData = { 2: { A: det("d2", "A") } };

    render().current.shiftTrack("instance-A", [2], 1, "frames.polylines");

    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: "frames.polylines",
      instanceId: "A",
      frame: 2,
    });
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: "frames.polylines", instanceId: "A", frame: 3 },
      { _cls: "Detection", label: "x", bounding_box: [0, 0, 1, 1] },
    );
  });

  it("deleteTrack removes every frame it appears on and notifies", () => {
    frameData = { 1: { A: det("d1", "A") }, 4: { A: det("d4", "A") } };

    render().current.deleteTrack("instance-A");

    expect(mockActions.deleteLabel).toHaveBeenCalledTimes(2);
    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: PATH,
      instanceId: "A",
      frame: 1,
    });
    expect(mockBus.dispatch).toHaveBeenCalledWith("annotation:trackDeleted", {
      trackId: "instance-A",
    });
  });

  it("deleteTrack addresses a non-primary frame field when given its path", () => {
    frameData = { 2: { A: det("d2", "A") } };

    render().current.deleteTrack("instance-A", "frames.detections_2");

    expect(mockActions.deleteLabel).toHaveBeenCalledTimes(1);
    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: "frames.detections_2",
      instanceId: "A",
      frame: 2,
    });
  });

  it("updateTrackAttributes merges onto every frame", () => {
    frameData = { 1: { A: det("d1", "A") }, 3: { A: det("d3", "A") } };

    render().current.updateTrackAttributes("instance-A", { label: "car" });

    expect(mockActions.updateLabel).toHaveBeenCalledTimes(2);
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "A", frame: 1 },
      { label: "car" },
    );
  });
});

describe("track identity ops (split / merge)", () => {
  it("splitTrack re-keys frames >= atFrame onto a fresh instance, one transaction", () => {
    frameData = {
      1: { A: det("d1", "A") },
      2: { A: det("d2", "A") },
      3: { A: det("d3", "A", { keyframe: true }) },
      4: { A: det("d4", "A") },
    };

    render().current.splitTrack("instance-A", 3);

    expect(mockActions.transaction).toHaveBeenCalledTimes(1);

    // frames 3 and 4 (>= 3) are deleted off A...
    expect(mockActions.deleteLabel).toHaveBeenCalledTimes(2);
    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: PATH,
      instanceId: "A",
      frame: 3,
    });
    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: PATH,
      instanceId: "A",
      frame: 4,
    });

    // ...and re-laid under the minted instance, identity stripped, content kept
    expect(mockActions.updateLabel).toHaveBeenCalledTimes(2);
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "NEW", frame: 3 },
      {
        _cls: "Detection",
        label: "x",
        bounding_box: [0, 0, 1, 1],
        keyframe: true,
      },
    );
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "NEW", frame: 4 },
      { _cls: "Detection", label: "x", bounding_box: [0, 0, 1, 1] },
    );

    // frames 1, 2 (< 3) are untouched
    expect(mockActions.deleteLabel).not.toHaveBeenCalledWith(
      expect.objectContaining({ frame: 1 }),
    );

    expect(mockBus.dispatch).toHaveBeenCalledWith("annotation:trackSplit", {
      trackId: "instance-A",
      instanceId: "A",
      newInstanceId: "NEW",
      atFrame: 3,
    });
  });

  it("splitTrack no-ops when no frame is at or after the boundary", () => {
    frameData = { 1: { A: det("d1", "A") }, 2: { A: det("d2", "A") } };

    render().current.splitTrack("instance-A", 5);

    expect(mockActions.transaction).not.toHaveBeenCalled();
    expect(mockEngine.mintInstanceId).not.toHaveBeenCalled();
    expect(mockBus.dispatch).not.toHaveBeenCalled();
  });

  it("splitTrack skips a legacy track-<index> id", () => {
    frameData = { 2: { A: det("d2", "A") } };

    render().current.splitTrack("track-4", 1);

    expect(mockActions.transaction).not.toHaveBeenCalled();
    expect(mockEngine.mintInstanceId).not.toHaveBeenCalled();
  });

  it("mergeTracks re-keys source frames onto the target, target-wins on overlap", () => {
    frameData = {
      1: { A: det("d1a", "A") },
      2: { A: det("d2a", "A"), B: det("d2b", "B") },
      3: { B: det("d3b", "B") },
    };

    // merge B (source) into A (target)
    render().current.mergeTracks("instance-B", "instance-A");

    expect(mockActions.transaction).toHaveBeenCalledTimes(1);

    // every source (B) frame is dropped
    expect(mockActions.deleteLabel).toHaveBeenCalledTimes(2);
    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: PATH,
      instanceId: "B",
      frame: 2,
    });
    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: PATH,
      instanceId: "B",
      frame: 3,
    });

    // frame 2 overlaps (A present) → target-wins, no re-stamp; only frame 3
    // (A absent) is re-laid onto A
    expect(mockActions.updateLabel).toHaveBeenCalledTimes(1);
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "A", frame: 3 },
      { _cls: "Detection", label: "x", bounding_box: [0, 0, 1, 1] },
    );

    expect(mockBus.dispatch).toHaveBeenCalledWith("annotation:trackMerged", {
      sourceTrackId: "instance-B",
      targetTrackId: "instance-A",
      sourceInstanceId: "B",
      targetInstanceId: "A",
    });
  });

  it("mergeTracks no-ops on a self-merge", () => {
    frameData = { 1: { A: det("d1", "A") } };

    render().current.mergeTracks("instance-A", "instance-A");

    expect(mockActions.transaction).not.toHaveBeenCalled();
    expect(mockBus.dispatch).not.toHaveBeenCalled();
  });

  it("mergeTracks skips a legacy track-<index> on either side", () => {
    frameData = { 1: { A: det("d1", "A") } };

    render().current.mergeTracks("track-1", "instance-A");
    render().current.mergeTracks("instance-A", "track-1");

    expect(mockActions.transaction).not.toHaveBeenCalled();
  });
});

describe("temporal-detection ops", () => {
  it("createTemporalDetection mints a sample-level TD and returns its id", () => {
    const id = render().current.createTemporalDetection(
      "events",
      [3, 12],
      "speaking",
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
      { support: [5, 9] },
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
