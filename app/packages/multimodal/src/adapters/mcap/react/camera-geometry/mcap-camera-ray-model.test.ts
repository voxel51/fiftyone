import { describe, expect, it } from "vitest";

import { mcapCameraRayModel } from "./mcap-camera-ray-model";
import type { McapCameraModel } from "./mcap-camera-model";

describe("MCAP camera ray model", () => {
  it("is stable per camera model and preserves behind-camera fisheye rays", () => {
    const model: McapCameraModel = {
      D: [0, 0, 0, 0],
      height: 100,
      K: [20, 0, 50, 0, 20, 50, 0, 0, 1],
      kind: "equidistant",
      maxTheta: 3,
      space: "original",
      width: 100,
    };
    const first = mcapCameraRayModel(model);
    const second = mcapCameraRayModel(model);
    expect(second).toBe(first);
    expect(first.rayForPixel(99, 50)?.[2]).toBeLessThan(0);
  });
});
