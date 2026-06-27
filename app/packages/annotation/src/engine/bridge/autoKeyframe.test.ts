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

  it("idempotent: keyframe already true stays true and bbox passes through", () => {
    const result = autoKeyframeOnGeometryEdit("frames.detections", {
      bounding_box: [0.1, 0.2, 0.3, 0.4],
      keyframe: true,
    });
    expect(result).toEqual({
      bounding_box: [0.1, 0.2, 0.3, 0.4],
      keyframe: true,
    });
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
