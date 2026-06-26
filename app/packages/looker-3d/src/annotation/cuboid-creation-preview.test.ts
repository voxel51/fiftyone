import { describe, expect, it } from "vitest";
import type { CuboidCreationState } from "../types";
import type { AnnotationPlaneState } from "./types";
import { getCuboidCreationPreview } from "./cuboid-creation-preview";

const annotationPlane: AnnotationPlaneState = {
  enabled: true,
  position: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
  showX: true,
  showY: true,
  showZ: false,
};

describe("getCuboidCreationPreview", () => {
  it("returns null before the first cuboid creation click", () => {
    const state: CuboidCreationState = {
      step: 0,
      centerPosition: null,
      orientationPoint: null,
      currentPosition: null,
    };

    expect(getCuboidCreationPreview(state, annotationPlane)).toBeNull();
  });

  it("anchors the step-one length at the first click and grows toward the cursor", () => {
    const state: CuboidCreationState = {
      step: 1,
      centerPosition: [0, 0, 0],
      orientationPoint: null,
      currentPosition: [2, 0, 0],
    };

    const preview = getCuboidCreationPreview(state, annotationPlane);

    // Length equals the click-to-cursor distance (not doubled), and the box is
    // centered at the midpoint so the near edge stays at the first click.
    expect(preview?.location).toEqual([1, 0, 0]);
    expect(preview?.dimensions).toEqual([2, 0.1, 1]);
    expect(preview?.quaternion).toEqual([0, 0, 0, 1]);
  });

  it("grows the step-two width toward the cursor side only", () => {
    const state: CuboidCreationState = {
      step: 2,
      centerPosition: [0, 0, 0],
      orientationPoint: [2, 0, 0],
      currentPosition: [2, 2, 0],
    };

    const preview = getCuboidCreationPreview(state, annotationPlane);

    // Length spans first click -> orientation (2). Width spans the perpendicular
    // distance to the cursor (2), with the box shifted half its width toward the
    // cursor so the anchored edge stays put: center = (1, 1, 0).
    expect(preview?.location).toEqual([1, 1, 0]);
    expect(preview?.dimensions).toEqual([2, 2, 1]);
    expect(preview?.quaternion).toEqual([0, 0, 0, 1]);
  });
});
