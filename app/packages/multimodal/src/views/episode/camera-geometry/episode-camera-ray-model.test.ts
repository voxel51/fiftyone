import { describe, expect, it } from "vitest";

import { episodeCameraRayModel } from "./episode-camera-ray-model";
import type { EpisodeCameraModel } from "./episode-camera-model";

describe("episode camera ray model", () => {
  it("is stable per camera model and preserves behind-camera fisheye rays", () => {
    const model: EpisodeCameraModel = {
      D: [0, 0, 0, 0],
      height: 100,
      K: [20, 0, 50, 0, 20, 50, 0, 0, 1],
      kind: "equidistant",
      maxTheta: 3,
      space: "original",
      width: 100,
    };
    const first = episodeCameraRayModel(model);
    const second = episodeCameraRayModel(model);
    expect(second).toBe(first);
    expect(first.rayForPixel(99, 50)?.[2]).toBeLessThan(0);
  });
});
