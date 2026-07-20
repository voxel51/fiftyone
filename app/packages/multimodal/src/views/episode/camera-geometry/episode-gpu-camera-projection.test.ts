import { describe, expect, it } from "vitest";

import { episodeGpuCameraProjection } from "./episode-gpu-camera-projection";
import type { EpisodeCameraModel } from "./episode-camera-model";

const IDENTITY_ROTATION = { w: 1, x: 0, y: 0, z: 0 } as const;
const ZERO_TRANSLATION = { x: 0, y: 0, z: 0 } as const;

describe("episode GPU camera-model projection", () => {
  it("prepares rational coefficients in shader order", () => {
    const projection = episodeGpuCameraProjection({
      model: {
        D: [1, 2, 3, 4, 5, 6, 7, 8],
        height: 100,
        K: [100, 1, 50, 2, 101, 51, 0, 0, 1],
        kind: "rational-polynomial",
        maxRadius: 1.5,
        space: "original",
        width: 100,
      },
      rotation: IDENTITY_ROTATION,
      translation: ZERO_TRANSLATION,
    });
    expect(projection?.kind).toBe("rational-polynomial");
    if (projection?.kind !== "rational-polynomial") {
      throw new Error("Expected rational GPU projection");
    }
    expect(projection.distortionLow.toArray()).toEqual([1, 2, 3, 4]);
    expect(projection.distortionHigh.toArray()).toEqual([5, 6, 7, 8]);
    expect(projection.intrinsicsX.toArray()).toEqual([100, 1, 50, 0]);
    expect(projection.intrinsicsY.toArray()).toEqual([2, 101, 51, 0]);
  });

  it("precomposes rectification for pinhole projection", () => {
    const model: EpisodeCameraModel = {
      height: 100,
      kind: "pinhole",
      projection: [100, 0, 50, 0, 0, 100, 50, 0, 0, 0, 1, 0],
      rectification: [0, -1, 0, 1, 0, 0, 0, 0, 1],
      space: "rectified",
      width: 100,
    };
    const projection = episodeGpuCameraProjection({
      model,
      rotation: IDENTITY_ROTATION,
      translation: ZERO_TRANSLATION,
    });
    expect(projection?.kind).toBe("pinhole");
    if (projection?.kind !== "pinhole") {
      throw new Error("Expected pinhole GPU projection");
    }
    const elements = projection.projectionMatrix.elements;
    expect(elements[0]).toBeCloseTo(0);
    expect(elements[1]).toBeCloseTo(100);
    expect(elements[4]).toBeCloseTo(-100);
    expect(elements[5]).toBeCloseTo(0);
  });
});
