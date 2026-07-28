import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  buildCameraControlOptionsFromTransforms,
  resolveCameraSelectorTarget,
} from "./utils";

describe("buildCameraControlOptionsFromTransforms", () => {
  it("includes quaternion values in camera options", () => {
    const options = buildCameraControlOptionsFromTransforms([
      {
        source_frame: "ego",
        target_frame: "world",
        translation: [0, 1, 2],
        quaternion: [0, 0, 0, 1],
      },
    ]);

    expect(options).toEqual([
      {
        key: "ego::world",
        label: "ego",
        sourceFrame: "ego",
        targetFrame: "world",
        translation: [0, 1, 2],
        quaternion: [0, 0, 0, 1],
      },
    ]);
  });
});

describe("resolveCameraSelectorTarget", () => {
  it("keeps the fallback target when it is not colocated with camera position", () => {
    const target = resolveCameraSelectorTarget({
      translation: [1, 2, 3],
      quaternion: [0, 0, 0, 1],
      fallbackTarget: new Vector3(10, 2, 3),
    });

    expect(target.toArray()).toEqual([10, 2, 3]);
  });

  it("uses camera forward from quaternion when fallback target is colocated", () => {
    const target = resolveCameraSelectorTarget({
      translation: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
      fallbackTarget: new Vector3(0, 0, 0),
    });

    expect(target.x).toBeCloseTo(0);
    expect(target.y).toBeCloseTo(0);
    expect(target.z).toBeCloseTo(1);
  });

  it("respects quaternion orientation when deriving fallback target", () => {
    const target = resolveCameraSelectorTarget({
      translation: [0, 0, 0],
      quaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
      fallbackTarget: new Vector3(0, 0, 0),
    });

    expect(target.x).toBeCloseTo(1);
    expect(target.y).toBeCloseTo(0);
    expect(target.z).toBeCloseTo(0);
  });

  it("falls back to +Z when fallback target and quaternion are invalid", () => {
    const target = resolveCameraSelectorTarget({
      translation: [4, 5, 6],
      quaternion: [Number.NaN, Number.NaN, Number.NaN, Number.NaN],
      fallbackTarget: new Vector3(Number.NaN, Number.NaN, Number.NaN),
    });

    expect(target.toArray()).toEqual([4, 5, 7]);
  });
});
