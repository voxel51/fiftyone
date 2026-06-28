import { describe, expect, it } from "vitest";

import { autoKeyframeOnGeometryEdit } from "./autoKeyframe";

describe("autoKeyframeOnGeometryEdit", () => {
  it("adds keyframe=true on a frame-level bbox edit", () => {
    const result = autoKeyframeOnGeometryEdit("frames.detections", {
      bounding_box: [0.1, 0.2, 0.3, 0.4],
    });
    expect(result).toEqual({
      bounding_box: [0.1, 0.2, 0.3, 0.4],
      keyframe: true,
    });
  });

  it("adds keyframe=true on a frame-level polyline points edit", () => {
    const result = autoKeyframeOnGeometryEdit("frames.polylines", {
      points: [[[0.1, 0.2]]],
    });
    expect(result).toEqual({
      points: [[[0.1, 0.2]]],
      keyframe: true,
    });
  });

  it("does not promote a class/attribute-only edit on a frame-level path", () => {
    const result = autoKeyframeOnGeometryEdit("frames.detections", {
      label: "cat",
    });
    expect(result).toEqual({ label: "cat" });
    expect(result).not.toHaveProperty("keyframe");
  });

  it("does not promote a sample-level bbox edit (non-video path)", () => {
    const result = autoKeyframeOnGeometryEdit("ground_truth", {
      bounding_box: [0.1, 0.2, 0.3, 0.4],
    });
    expect(result).toEqual({ bounding_box: [0.1, 0.2, 0.3, 0.4] });
    expect(result).not.toHaveProperty("keyframe");
  });

  it("does not promote a sample-level polyline points edit (non-video path)", () => {
    const result = autoKeyframeOnGeometryEdit("polylines", {
      points: [[[0.1, 0.2]]],
    });
    expect(result).toEqual({ points: [[[0.1, 0.2]]] });
    expect(result).not.toHaveProperty("keyframe");
  });

  it("returns the same object reference when no augmentation is needed", () => {
    const partial = { label: "cat" };
    expect(autoKeyframeOnGeometryEdit("frames.detections", partial)).toBe(
      partial,
    );
  });

  it("always returns a new object even when keyframe is already true", () => {
    // Case B: a resize on an already-keyframed frame re-anchors the
    // keyframe's geometry; the bracketing tween segments need to re-interp,
    // so the helper must produce a new object so the controller fires
    // `annotation:keyframeChanged`. Downstream listeners coalesce via
    // microtask drain to keep work bounded per tick.
    const partial = {
      bounding_box: [0.1, 0.2, 0.3, 0.4],
      keyframe: true,
    };
    const result = autoKeyframeOnGeometryEdit("frames.detections", partial);
    expect(result).not.toBe(partial); // new object: signals promotion
    expect(result).toEqual({
      bounding_box: [0.1, 0.2, 0.3, 0.4],
      keyframe: true,
    });
  });

  it("does not promote when the bbox equals the current label's bbox (pure click)", () => {
    // B22: a selection-only click flows through `commit` with the current
    // geometry echoed in the partial. The helper must skip promotion AND
    // signal "no promotion" by returning the original reference.
    const partial = { bounding_box: [0.1, 0.2, 0.3, 0.4] };
    const current = {
      _id: "d1",
      bounding_box: [0.1, 0.2, 0.3, 0.4],
    };
    const result = autoKeyframeOnGeometryEdit(
      "frames.detections",
      partial,
      current,
    );
    expect(result).toBe(partial);
    expect(result).not.toHaveProperty("keyframe");
  });

  it("does not promote when polyline points equal the current label's points", () => {
    const partial = { points: [[[0.1, 0.2]]] };
    const current = {
      _id: "p1",
      points: [[[0.1, 0.2]]],
    };
    const result = autoKeyframeOnGeometryEdit(
      "frames.polylines",
      partial,
      current,
    );
    expect(result).toBe(partial);
  });

  it("promotes a real bbox nudge against the current label", () => {
    const partial = { bounding_box: [0.1, 0.2, 0.3, 0.4] };
    const current = {
      _id: "d1",
      bounding_box: [0.1, 0.2, 0.3, 0.5],
    };
    const result = autoKeyframeOnGeometryEdit(
      "frames.detections",
      partial,
      current,
    );
    expect(result).not.toBe(partial);
    expect(result.keyframe).toBe(true);
  });

  it("Case B: real edit on an already-keyframed label still re-fires", () => {
    // A drag on a keyframed bbox must still produce a new object so the
    // controller dispatches `onAutoKeyframe` and the bracketing tween
    // segments re-interp. Equality is what gates the skip, not keyframe.
    const partial = {
      bounding_box: [0.15, 0.2, 0.3, 0.4],
      keyframe: true,
    };
    const current = {
      _id: "d1",
      bounding_box: [0.1, 0.2, 0.3, 0.4],
      keyframe: true,
    };
    const result = autoKeyframeOnGeometryEdit(
      "frames.detections",
      partial,
      current,
    );
    expect(result).not.toBe(partial);
    expect(result.keyframe).toBe(true);
  });

  it("explicit keyframe=false on a geometry edit is overridden to true", () => {
    // Propagation-filled frames carry `keyframe: false`. A subsequent user
    // resize lands here with `keyframe: false` from the source; the auto-rule
    // pins the frame as the user just edited it.
    const result = autoKeyframeOnGeometryEdit("frames.detections", {
      bounding_box: [0.1, 0.2, 0.3, 0.4],
      keyframe: false,
    });
    expect(result.keyframe).toBe(true);
  });
});
