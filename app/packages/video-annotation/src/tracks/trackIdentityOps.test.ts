import { beforeEach, describe, expect, it } from "vitest";
import {
  PATH,
  deps,
  det,
  harness,
  mockActions,
  mockBus,
  mockEngine,
  resetHarness,
} from "./opsTestHarness";
import {
  makeTrackIdentityOps,
  type TrackIdentityOps,
} from "./trackIdentityOps";

let ops: TrackIdentityOps;

beforeEach(() => {
  resetHarness();
  ops = makeTrackIdentityOps(deps());
});

describe("track identity ops (split / merge)", () => {
  it("splitTrack re-keys frames >= atFrame onto a fresh instance, one transaction", () => {
    harness.frameData = {
      1: { A: det("d1", "A") },
      2: { A: det("d2", "A") },
      3: { A: det("d3", "A", { keyframe: true }) },
      4: { A: det("d4", "A") },
    };

    ops.splitTrack("instance-A", 3);

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
    // 2 re-stamps onto the new instance + 1 keyframe pin on the head's last
    // frame (the cut is pinned on both sides so the lerp there is retained)
    expect(mockActions.updateLabel).toHaveBeenCalledTimes(3);

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

  it("splits a track on its own field when the caller omits one", () => {
    // Regression: the toolbar's Split button calls `splitTrack(id, frame)` with
    // no field, which defaulted to the stream's PRIMARY field. A polyline track
    // lives on `frames.polylines`, so the reader found no frames for it, the
    // empty-tail guard returned, and the button silently did nothing.
    harness.frameData = {
      1: { A: det("d1", "A") },
      2: { A: det("d2", "A") },
      3: { A: det("d3", "A") },
    };
    harness.activeRefs = [{ instanceId: "A", path: "frames.polylines" }];

    ops.splitTrack("instance-A", 2);

    expect(mockActions.transaction).toHaveBeenCalledTimes(1);
    // frames 2 and 3 move to the new instance, addressed on the POLYLINE field
    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: "frames.polylines",
      instanceId: "A",
      frame: 2,
    });
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: "frames.polylines", instanceId: "NEW", frame: 2 },
      expect.anything(),
    );
    expect(mockBus.dispatch).toHaveBeenCalledWith(
      "annotation:trackSplit",
      expect.objectContaining({ instanceId: "A", newInstanceId: "NEW" }),
    );
  });

  it("pins both sides of the cut as keyframes, retaining the lerp there", () => {
    // A split makes each half an independent track. The two frames either side
    // of the cut are usually interpolated filler, so without pinning them the
    // next re-lerp on either half recomputes its boundary frame from that half's
    // own keyframes and the shape at the cut jumps.
    harness.frameData = {
      1: { A: det("d1", "A", { keyframe: true }) },
      2: { A: det("d2", "A") },
      3: { A: det("d3", "A") },
      4: { A: det("d4", "A", { keyframe: true }) },
    };

    ops.splitTrack("instance-A", 3);

    // head: frame 2 is now its last frame, pinned in place
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "A", frame: 2 },
      { keyframe: true },
    );
    // tail: frame 3 arrives on the new instance already a keyframe
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "NEW", frame: 3 },
      expect.objectContaining({ keyframe: true }),
    );
    // the rest of the tail is copied as filler, not promoted
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "NEW", frame: 4 },
      expect.objectContaining({ keyframe: true }),
    );
  });

  it("does not pin a head that does not exist (cut at the first frame)", () => {
    harness.frameData = { 1: { A: det("d1", "A") }, 2: { A: det("d2", "A") } };

    ops.splitTrack("instance-A", 1);

    // nothing stays behind, so there is no head frame to pin
    expect(mockActions.updateLabel).not.toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: "A" }),
      { keyframe: true },
    );
    // the tail's first frame is still pinned
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "NEW", frame: 1 },
      expect.objectContaining({ keyframe: true }),
    );
  });

  it("an explicit field still wins over the selection's", () => {
    // the timeline's context menu knows the field and passes it; that must not
    // be overridden by whatever happens to be selected
    harness.frameData = { 1: { A: det("d1", "A") }, 2: { A: det("d2", "A") } };
    harness.activeRefs = [{ instanceId: "A", path: "frames.polylines" }];

    ops.splitTrack("instance-A", 2, "frames.detections_2");

    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: "frames.detections_2",
      instanceId: "A",
      frame: 2,
    });
  });

  it("merges on the source track's own field when the caller omits one", () => {
    harness.frameData = { 1: { A: det("d1", "A") }, 2: { B: det("d2", "B") } };
    harness.activeRefs = [{ instanceId: "A", path: "frames.polylines" }];

    ops.mergeTracks("instance-A", "instance-B");

    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: "frames.polylines",
      instanceId: "A",
      frame: 1,
    });
  });

  it("splitTrack no-ops when no frame is at or after the boundary", () => {
    harness.frameData = { 1: { A: det("d1", "A") }, 2: { A: det("d2", "A") } };

    ops.splitTrack("instance-A", 5);

    expect(mockActions.transaction).not.toHaveBeenCalled();
    expect(mockEngine.mintInstanceId).not.toHaveBeenCalled();
    expect(mockBus.dispatch).not.toHaveBeenCalled();
  });

  it("splitTrack skips a legacy track-<index> id", () => {
    harness.frameData = { 2: { A: det("d2", "A") } };

    ops.splitTrack("track-4", 1);

    expect(mockActions.transaction).not.toHaveBeenCalled();
    expect(mockEngine.mintInstanceId).not.toHaveBeenCalled();
  });

  it("mergeTracks re-keys source frames onto the target, target-wins on overlap", () => {
    harness.frameData = {
      1: { A: det("d1a", "A") },
      2: { A: det("d2a", "A"), B: det("d2b", "B") },
      3: { B: det("d3b", "B") },
    };

    // merge B (source) into A (target)
    ops.mergeTracks("instance-B", "instance-A");

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
    harness.frameData = { 1: { A: det("d1", "A") } };

    ops.mergeTracks("instance-A", "instance-A");

    expect(mockActions.transaction).not.toHaveBeenCalled();
    expect(mockBus.dispatch).not.toHaveBeenCalled();
  });

  it("mergeTracks operates on an index-based track-<index> (a real address)", () => {
    // source is an instance-less index track; the engine addresses it by its
    // synthetic `track-1` id, so merge treats it like any other track
    harness.frameData = {
      1: { "track-1": det("d1", "track-1", { index: 1, instance: undefined }) },
      2: { A: det("d2", "A") },
    };

    ops.mergeTracks("track-1", "instance-A");

    expect(mockActions.transaction).toHaveBeenCalledTimes(1);
    expect(mockActions.deleteLabel).toHaveBeenCalledWith({
      path: PATH,
      instanceId: "track-1",
      frame: 1,
    });
    // frame 1 has no target box → the source content is re-laid onto A
    expect(mockActions.updateLabel).toHaveBeenCalledWith(
      { path: PATH, instanceId: "A", frame: 1 },
      expect.objectContaining({ label: "x", bounding_box: [0, 0, 1, 1] }),
    );
  });
});
