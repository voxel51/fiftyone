import { describe, expect, it, vi } from "vitest";

import {
  drawProjectedPoints,
  hasNonTrivialDistortion,
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
    // Depth drives colour by default.
    expect(Array.from(projection?.values ?? [])).toEqual([10, 10]);
    expect(projection?.minValue).toBe(10);
    expect(projection?.maxValue).toBe(10);
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
    expect(projection?.values[0]).toBeCloseTo(12);
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

  it("carries a scalar channel when supplied and tracks its range", () => {
    const projection = projectPointCloudToImage({
      calibration: PINHOLE_K,
      colorValues: Float32Array.from([7, 21]),
      positions: Float32Array.from([0, 0, 10, 0.1, 0, 5]),
      rotation: IDENTITY_ROTATION,
      translation: ZERO_TRANSLATION,
    });

    expect(Array.from(projection?.values ?? [])).toEqual([7, 21]);
    expect(projection?.minValue).toBe(7);
    expect(projection?.maxValue).toBe(21);
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

describe("hasNonTrivialDistortion", () => {
  it("flags only declared models with non-zero coefficients", () => {
    expect(hasNonTrivialDistortion({})).toBe(false);
    expect(
      hasNonTrivialDistortion({ D: [0.1], distortionModel: undefined }),
    ).toBe(false);
    expect(
      hasNonTrivialDistortion({ D: [0, 0, 0], distortionModel: "plumb_bob" }),
    ).toBe(false);
    expect(
      hasNonTrivialDistortion({
        D: [-0.2, 0.05, 0, 0, 0],
        distortionModel: "plumb_bob",
      }),
    ).toBe(true);
  });
});

describe("drawProjectedPoints", () => {
  it("draws every point while batching fill-style changes by ramp bucket", () => {
    const count = 500;
    const uv = new Float32Array(count * 2);
    const values = new Float32Array(count);
    for (let index = 0; index < count; index++) {
      uv[index * 2] = index % 100;
      uv[index * 2 + 1] = Math.floor(index / 100);
      values[index] = index;
    }

    const fillStyles: string[] = [];
    const fillRect = vi.fn();
    const context = {
      fillRect,
      set fillStyle(value: string) {
        fillStyles.push(value);
      },
    } as unknown as CanvasRenderingContext2D;

    drawProjectedPoints(
      context,
      { count, maxValue: count - 1, minValue: 0, uv, values },
      { colormap: "turbo", dotSize: 3 },
    );

    expect(fillRect).toHaveBeenCalledTimes(count);
    expect(fillStyles.length).toBeLessThanOrEqual(64);
    expect(new Set(fillStyles).size).toBe(fillStyles.length);
    // Dots center on the projected pixel.
    expect(fillRect.mock.calls[0]).toHaveLength(4);
    expect(fillRect.mock.calls[0][2]).toBe(3);
  });

  it("collapses constant-valued clouds into one mid-ramp bucket", () => {
    const fillStyles: string[] = [];
    const context = {
      fillRect: vi.fn(),
      set fillStyle(value: string) {
        fillStyles.push(value);
      },
    } as unknown as CanvasRenderingContext2D;

    drawProjectedPoints(
      context,
      {
        count: 3,
        maxValue: 5,
        minValue: 5,
        uv: Float32Array.from([1, 1, 2, 2, 3, 3]),
        values: Float32Array.from([5, 5, 5]),
      },
      { colormap: "turbo", dotSize: 2 },
    );

    expect(fillStyles).toHaveLength(1);
  });
});
