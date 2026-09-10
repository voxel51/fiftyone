import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PATH,
  deps,
  det,
  harness,
  mockActions,
  mockBus,
  resetHarness,
} from "./opsTestHarness";
import { makeTrackOps, type TrackOps } from "./trackOps";

vi.mock("@fiftyone/playback", () => ({ frameAt: (time: number) => time }));

let ops: TrackOps;

beforeEach(() => {
  resetHarness();
  ops = makeTrackOps(deps());
});

describe("track ops", () => {
  it("markKeyframe toggles keyframe on the addressed frame and notifies", () => {
    // Legacy data may still carry a `propagation` blob; markKeyframe must NOT
    // try to clear it with `propagation: null` (that null is the poison).
    harness.frameData = {
      2: { A: det("d2", "A", { keyframe: false, propagation: { foo: 1 } }) },
    };

    ops.markKeyframe(2, ["instance-A"]);

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
    harness.frameData = { 2: { A: det("d2", "A", { keyframe: false }) } };

    ops.markKeyframe(2, ["instance-A"]);

    // the toggle transaction carries the minted key so the auto-interpolate
    // re-lerp coalesces into the same undo unit
    expect(mockActions.transaction).toHaveBeenCalledWith(expect.any(Function), {
      undoKey: "gesture:1",
    });
  });

  it("markKeyframe toggles on the track's own field when selected off-primary", () => {
    harness.frameData = { 2: { A: det("d2", "A", { keyframe: false }) } };
    // the selected track's active ref points at a non-primary frame field
    harness.activeRefs = [{ instanceId: "A", path: "frames.polylines" }];

    ops.markKeyframe(2, ["instance-A"]);

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
    harness.frameData = { 2: { A: det("d2", "A") } };

    ops.markKeyframe(2, ["track-4"]);

    expect(mockActions.updateLabel).not.toHaveBeenCalled();
    expect(mockBus.dispatch).not.toHaveBeenCalled();
  });

  it("extendTrack fills target frames with the source content as non-keyframes", () => {
    harness.frameData = {
      1: { A: det("d1", "A", { keyframe: true, confidence: 0.9 }) },
    };

    ops.extendTrack("instance-A", 1, [2, 3, 99]);

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

  it("extendTrack carries the source frame's mask onto the filler frames", () => {
    const mask = { shape: [2, 2], counts: "abcd" };
    harness.frameData = {
      1: { A: det("d1", "A", { keyframe: true, mask }) },
    };

    ops.extendTrack("instance-A", 1, [2]);

    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "A", frame: 2 },
      {
        _cls: "Detection",
        label: "x",
        bounding_box: [0, 0, 1, 1],
        mask,
        keyframe: false,
      },
    );
  });

  it("trimTrack deletes only frames where the track is present", () => {
    harness.frameData = { 2: { A: det("d2", "A") } };

    ops.trimTrack("instance-A", [2, 3]);

    expect(mockActions.deleteLabel).toHaveBeenCalledTimes(1);
    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: PATH,
      instanceId: "A",
      frame: 2,
    });
  });

  it("shiftTrack deletes originals then re-lays content at frame+delta", () => {
    harness.frameData = { 2: { A: det("d2", "A", { keyframe: true }) } };

    ops.shiftTrack("instance-A", [2], 1);

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
    harness.frameData = { 1: { A: det("d1", "A", { keyframe: true }) } };

    ops.extendTrack("instance-A", 1, [2], undefined, "frames.polylines");

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
    harness.frameData = { 2: { A: det("d2", "A") } };

    ops.trimTrack("instance-A", [2], "frames.polylines");

    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: "frames.polylines",
      instanceId: "A",
      frame: 2,
    });
  });

  it("shiftTrack re-lays content on a non-primary frame field when given its path", () => {
    harness.frameData = { 2: { A: det("d2", "A") } };

    ops.shiftTrack("instance-A", [2], 1, "frames.polylines");

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
    harness.frameData = { 1: { A: det("d1", "A") }, 4: { A: det("d4", "A") } };

    ops.deleteTrack("instance-A");

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
    harness.frameData = { 2: { A: det("d2", "A") } };

    ops.deleteTrack("instance-A", "frames.detections_2");

    expect(mockActions.deleteLabel).toHaveBeenCalledTimes(1);
    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: "frames.detections_2",
      instanceId: "A",
      frame: 2,
    });
  });

  it("updateTrackAttributes merges onto every frame", () => {
    harness.frameData = { 1: { A: det("d1", "A") }, 3: { A: det("d3", "A") } };

    ops.updateTrackAttributes("instance-A", { label: "car" });

    expect(mockActions.updateLabel).toHaveBeenCalledTimes(2);
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "A", frame: 1 },
      { label: "car" },
    );
  });
});
