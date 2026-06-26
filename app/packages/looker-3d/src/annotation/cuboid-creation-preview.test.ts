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

  it("builds the step-one length preview", () => {
    const state: CuboidCreationState = {
      step: 1,
      centerPosition: [0, 0, 0],
      orientationPoint: null,
      currentPosition: [2, 0, 0],
    };

    const preview = getCuboidCreationPreview(state, annotationPlane);

    expect(preview?.location).toEqual([0, 0, 0]);
    expect(preview?.dimensions).toEqual([4, 0.1, 1]);
    expect(preview?.quaternion).toEqual([0, 0, 0, 1]);
  });

  it("builds the step-two width preview", () => {
    const state: CuboidCreationState = {
      step: 2,
      centerPosition: [0, 0, 0],
      orientationPoint: [2, 0, 0],
      currentPosition: [2, 2, 0],
    };

    const preview = getCuboidCreationPreview(state, annotationPlane);

    expect(preview?.location).toEqual([0, 0, 0]);
    expect(preview?.dimensions).toEqual([4, 4, 1]);
    expect(preview?.quaternion).toEqual([0, 0, 0, 1]);
  });
});
