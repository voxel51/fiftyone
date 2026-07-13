import { describe, expect, it } from "vitest";

import {
  pickProjectedPoint,
  projectPointCloudToImage,
} from "./mcap-image-projection";

const IDENTITY_ROTATION = { w: 1, x: 0, y: 0, z: 0 };
const ZERO_TRANSLATION = { x: 0, y: 0, z: 0 };

// fx = fy = 100, cx = cy = 50 over a 100x100 image.
const PINHOLE_K = {
  K: [100, 0, 50, 0, 100, 50, 0, 0, 1],
  height: 100,
  width: 100,
};

describe("projectPointCloudToImage", () => {
  it("projects camera-frame points through the pinhole K", () => {
    const projection = projectPointCloudToImage({
      calibration: PINHOLE_K,
      positions: Float32Array.from([
        // Optical axis at 10m → principal point.
        0, 0, 10,
        // 1m right, 2m down at 10m → +10px, +20px from center.
        1, 2, 10,
      ]),
      rotation: IDENTITY_ROTATION,
      translation: ZERO_TRANSLATION,
    });

    expect(projection).not.toBeNull();
    expect(projection?.count).toBe(2);
    expect(Array.from(projection?.uv ?? [])).toEqual([50, 50, 60, 70]);
  });

  it("culls behind-camera, out-of-frame, and non-finite points", () => {
    const projection = projectPointCloudToImage({
      calibration: PINHOLE_K,
      positions: Float32Array.from([
        0,
        0,
        -5, // behind the camera
        20,
        0,
        10, // projects to u=250, off frame
        Number.NaN,
        0,
        10, // non-finite
        0,
        0,
        10, // survivor
      ]),
      rotation: IDENTITY_ROTATION,
      translation: ZERO_TRANSLATION,
    });

    expect(projection?.count).toBe(1);
    expect(Array.from(projection?.uv?.slice(0, 2) ?? [])).toEqual([50, 50]);
  });

  it("culls points on the exclusive right and bottom image edges", () => {
    const projection = projectPointCloudToImage({
      calibration: PINHOLE_K,
      positions: Float32Array.from([
        5,
        0,
        10, // u = width
        0,
        5,
        10, // v = height
        0,
        0,
        10, // survivor
      ]),
      rotation: IDENTITY_ROTATION,
      translation: ZERO_TRANSLATION,
    });

    expect(projection?.count).toBe(1);
    expect(Array.from(projection?.uv.slice(0, 2) ?? [])).toEqual([50, 50]);
  });

  it("applies the frame transform before projecting", () => {
    // 90° about +Y maps sensor -X onto camera +Z (forward).
    const halfSqrt2 = Math.SQRT1_2;
    const projection = projectPointCloudToImage({
      calibration: PINHOLE_K,
      positions: Float32Array.from([-10, 0, 0]),
      rotation: { w: halfSqrt2, x: 0, y: halfSqrt2, z: 0 },
      translation: { x: 0, y: 0, z: 2 },
    });

    expect(projection?.count).toBe(1);
    expect(projection?.uv[0]).toBeCloseTo(50);
    expect(projection?.uv[1]).toBeCloseTo(50);
  });

  it("prefers the rectified P matrix over K", () => {
    const projection = projectPointCloudToImage({
      calibration: {
        ...PINHOLE_K,
        // Different focal length in P: 1m at 10m → +20px, not +10px.
        P: [200, 0, 50, 0, 0, 200, 50, 0, 0, 0, 1, 0],
      },
      positions: Float32Array.from([1, 0, 10]),
      rotation: IDENTITY_ROTATION,
      translation: ZERO_TRANSLATION,
    });

    expect(projection?.uv[0]).toBeCloseTo(70);
  });

  it("colours surviving points through the writer by source index", () => {
    const projection = projectPointCloudToImage({
      calibration: PINHOLE_K,
      // Writes the decoded (source) index into the red channel, proving
      // culled points don't shift colour alignment.
      colorWriter: {
        colorRamp: null,
        write: (target, offset, sourceIndex, z) => {
          target[offset] = sourceIndex;
          target[offset + 2] = z;
        },
      },
      positions: Float32Array.from([
        0,
        0,
        -5, // culled: behind the camera
        0,
        0,
        10,
        1,
        0,
        5,
      ]),
      rotation: IDENTITY_ROTATION,
      translation: ZERO_TRANSLATION,
    });

    expect(projection?.count).toBe(2);
    // Survivors are source indexes 1 and 2, coloured with their own z.
    expect(projection?.colors[0]).toBe(1);
    expect(projection?.colors[2]).toBe(10);
    expect(projection?.colors[3]).toBe(2);
    expect(projection?.colors[5]).toBe(5);
  });

  it("falls back to neutral dots without a colour writer", () => {
    const projection = projectPointCloudToImage({
      calibration: PINHOLE_K,
      positions: Float32Array.from([0, 0, 10]),
      rotation: IDENTITY_ROTATION,
      translation: ZERO_TRANSLATION,
    });

    expect(projection?.colors[0]).toBeCloseTo(0.75);
    expect(projection?.colors[1]).toBeCloseTo(0.75);
    expect(projection?.colors[2]).toBeCloseTo(0.75);
  });

  it("stride-samples dense clouds down to the point budget", () => {
    const pointCount = 100;
    const positions = new Float32Array(pointCount * 3);
    for (let index = 0; index < pointCount; index++) {
      positions[index * 3 + 2] = 10;
    }

    const projection = projectPointCloudToImage({
      calibration: PINHOLE_K,
      maxPoints: 25,
      positions,
      rotation: IDENTITY_ROTATION,
      translation: ZERO_TRANSLATION,
    });

    expect(projection?.count).toBe(25);
  });

  it("returns null without usable intrinsics or points", () => {
    expect(
      projectPointCloudToImage({
        calibration: { height: 100, K: [], width: 100 },
        positions: Float32Array.from([0, 0, 10]),
        rotation: IDENTITY_ROTATION,
        translation: ZERO_TRANSLATION,
      }),
    ).toBeNull();
    expect(
      projectPointCloudToImage({
        calibration: PINHOLE_K,
        positions: new Float32Array(0),
        rotation: IDENTITY_ROTATION,
        translation: ZERO_TRANSLATION,
      }),
    ).toBeNull();
    expect(
      projectPointCloudToImage({
        calibration: PINHOLE_K,
        // Every point behind the camera.
        positions: Float32Array.from([0, 0, -1]),
        rotation: IDENTITY_ROTATION,
        translation: ZERO_TRANSLATION,
      }),
    ).toBeNull();
  });
});

describe("pickProjectedPoint", () => {
  it("returns the nearest projected point within the pick radius", () => {
    // Projects to (50, 50), (60, 70), and (40, 50).
    const positions = Float32Array.from([0, 0, 10, 1, 2, 10, -1, 0, 10]);

    const pick = pickProjectedPoint({
      calibration: PINHOLE_K,
      positions,
      radiusPx: 8,
      rotation: IDENTITY_ROTATION,
      targetU: 44,
      targetV: 50,
      translation: ZERO_TRANSLATION,
    });

    expect(pick).toMatchObject({ pointIndex: 2, u: 40, v: 50 });
    expect(pick?.distanceSq).toBe(16);
  });

  it("misses when nothing projects within the radius", () => {
    expect(
      pickProjectedPoint({
        calibration: PINHOLE_K,
        positions: Float32Array.from([0, 0, 10]),
        radiusPx: 4,
        rotation: IDENTITY_ROTATION,
        targetU: 80,
        targetV: 80,
        translation: ZERO_TRANSLATION,
      }),
    ).toBeNull();
  });

  it("never picks culled points", () => {
    // Behind the camera and off-frame candidates sit "near" the target
    // numerically but must stay unpickable, like they are undrawable.
    expect(
      pickProjectedPoint({
        calibration: PINHOLE_K,
        positions: Float32Array.from([0, 0, -10, 20, 0, 10]),
        radiusPx: 1_000,
        rotation: IDENTITY_ROTATION,
        targetU: 50,
        targetV: 50,
        translation: ZERO_TRANSLATION,
      }),
    ).toBeNull();
  });

  it("honors the draw stride so only drawable points are pickable", () => {
    // Two points at the same pixel; with maxPoints 1 only index 0 is
    // drawn, so the pick must resolve to it.
    const positions = Float32Array.from([0, 0, 10, 0.001, 0, 10]);

    const pick = pickProjectedPoint({
      calibration: PINHOLE_K,
      maxPoints: 1,
      positions,
      radiusPx: 5,
      rotation: IDENTITY_ROTATION,
      targetU: 50,
      targetV: 50,
      translation: ZERO_TRANSLATION,
    });

    expect(pick?.pointIndex).toBe(0);
  });
});
