import { describe, expect, it } from "vitest";

import { cameraRayModel } from "./camera-ray-model";
import type { CameraModel } from "./camera-model";

describe("episode camera ray model", () => {
  it("is stable per camera model and preserves behind-camera fisheye rays", () => {
    const model: CameraModel = {
      D: [0, 0, 0, 0],
      height: 100,
      K: [20, 0, 50, 0, 20, 50, 0, 0, 1],
      kind: "equidistant",
      maxTheta: 3,
      space: "original",
      width: 100,
    };
    const first = cameraRayModel(model);
    const second = cameraRayModel(model);
    expect(second).toBe(first);
    expect(first.rayForPixel(99, 50)?.[2]).toBeLessThan(0);
  });
});
