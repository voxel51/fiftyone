import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  fitCuboidHeightToPoints,
  type ScenePointCloud,
} from "./fit-cuboid-to-points";
import type { CuboidTransformData } from "./types";

const IDENTITY_QUAT: [number, number, number, number] = [0, 0, 0, 1];

const makeCloud = (
  points: [number, number, number][],
  matrixWorld = new THREE.Matrix4(),
): ScenePointCloud => ({
  positions: points.flat(),
  matrixWorld,
});

// Footprint is 2x2 at the origin; gesture height is the placeholder 1.
const baseTransform: CuboidTransformData = {
  location: [0, 0, 0],
  dimensions: [2, 2, 1],
  quaternion: IDENTITY_QUAT,
};

describe("fitCuboidHeightToPoints", () => {
  it("derives height and recenters from points inside the footprint", () => {
    // A vertical column of points spanning z in [1, 3], all within the footprint.
    const points: [number, number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      points.push([0, 0, 1 + (i / 10) * 2]);
    }

    const result = fitCuboidHeightToPoints(baseTransform, [makeCloud(points)]);

    // Height = span (2) + 2 * default margin (0.05).
    expect(result.dimensions[2]).toBeCloseTo(2.1, 5);
    // Length/width are preserved.
    expect(result.dimensions[0]).toBe(2);
    expect(result.dimensions[1]).toBe(2);
    // Center moves to the midpoint of the span (z = 2).
    expect(result.location[2]).toBeCloseTo(2, 5);
    expect(result.location[0]).toBeCloseTo(0, 5);
    expect(result.location[1]).toBeCloseTo(0, 5);
    // Bottom of the box snaps just below the lowest point.
    const bottom = result.location[2] - result.dimensions[2] / 2;
    expect(bottom).toBeCloseTo(1 - 0.05, 5);
  });

  it("respects the point cloud's world matrix", () => {
    // Local z in [-4, -2], translated up by 5 -> world z in [1, 3].
    const points: [number, number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      points.push([0, 0, -4 + (i / 10) * 2]);
    }
    const matrixWorld = new THREE.Matrix4().makeTranslation(0, 0, 5);

    const result = fitCuboidHeightToPoints(baseTransform, [
      makeCloud(points, matrixWorld),
    ]);

    expect(result.dimensions[2]).toBeCloseTo(2.1, 5);
    expect(result.location[2]).toBeCloseTo(2, 5);
  });

  it("ignores points outside the horizontal footprint", () => {
    const inside: [number, number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      inside.push([0, 0, 1 + (i / 10) * 2]);
    }
    // Far outside the 2x2 footprint, with extreme heights that must not count.
    const outside: [number, number, number][] = [
      [50, 50, -100],
      [50, 50, 100],
    ];

    const result = fitCuboidHeightToPoints(baseTransform, [
      makeCloud([...inside, ...outside]),
    ]);

    expect(result.dimensions[2]).toBeCloseTo(2.1, 5);
    expect(result.location[2]).toBeCloseTo(2, 5);
  });

  it("leaves the cuboid unchanged when too few points are enclosed", () => {
    const points: [number, number, number][] = [
      [0, 0, 1],
      [0, 0, 3],
    ];

    const result = fitCuboidHeightToPoints(baseTransform, [makeCloud(points)], {
      minPoints: 8,
    });

    expect(result).toEqual(baseTransform);
  });

  it("leaves the cuboid unchanged when there are no point clouds", () => {
    expect(fitCuboidHeightToPoints(baseTransform, [])).toEqual(baseTransform);
  });

  it("leaves the cuboid unchanged without a quaternion", () => {
    const noQuat: CuboidTransformData = {
      location: [0, 0, 0],
      dimensions: [2, 2, 1],
    };
    const points: [number, number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      points.push([0, 0, 1 + (i / 10) * 2]);
    }

    expect(fitCuboidHeightToPoints(noQuat, [makeCloud(points)])).toEqual(
      noQuat,
    );
  });

  it("honors a rotated cuboid's local height axis", () => {
    // Rotate -90° about world X: the box's local +Z (its "up", above the plane)
    // now points along world +Y, so height is measured along world Y.
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-Math.PI / 2, 0, 0),
    );
    const rotated: CuboidTransformData = {
      location: [0, 0, 0],
      dimensions: [2, 2, 1],
      quaternion: quaternion.toArray() as [number, number, number, number],
    };

    // Column of points spread along world Y in [1, 3] (above the plane).
    const points: [number, number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      points.push([0, 1 + (i / 10) * 2, 0]);
    }

    const result = fitCuboidHeightToPoints(rotated, [makeCloud(points)]);

    expect(result.dimensions[2]).toBeCloseTo(2.1, 5);
    // Center moves to the points' centroid along world Y (their span midpoint).
    expect(result.location[0]).toBeCloseTo(0, 5);
    expect(result.location[1]).toBeCloseTo(2, 5);
    expect(result.location[2]).toBeCloseTo(0, 5);
  });

  it("drops points far below the plane (ground bleed / outliers)", () => {
    // Object spans z in [0, 2] above the plane...
    const object: [number, number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      object.push([0, 0, (i / 10) * 2]);
    }
    // ...plus stray points well below the plane that must not drag the box down.
    const below: [number, number, number][] = [
      [0, 0, -3],
      [0, 0, -5],
    ];

    const result = fitCuboidHeightToPoints(baseTransform, [
      makeCloud([...object, ...below]),
    ]);

    // Bottom stays at the object base (~0), not at the -3/-5 outliers.
    expect(result.dimensions[2]).toBeCloseTo(2.1, 5);
    expect(result.location[2]).toBeCloseTo(1, 5);
  });

  it("keeps points within the below-plane margin", () => {
    // Object dips slightly below the plane, to z = -0.3 (within belowMargin).
    const points: [number, number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      points.push([0, 0, -0.3 + (i / 10) * 2.3]);
    }

    const result = fitCuboidHeightToPoints(baseTransform, [makeCloud(points)], {
      belowMargin: 0.5,
    });

    // Span is [-0.3, 2]; height = 2.3 + 2 * margin, center = midpoint 0.85.
    expect(result.dimensions[2]).toBeCloseTo(2.4, 5);
    expect(result.location[2]).toBeCloseTo(0.85, 5);
  });

  it("uses a high percentile so a lone tall outlier doesn't inflate height", () => {
    // 50 dense points in [0, 2] plus one speckle far above at z = 10.
    const points: [number, number, number][] = [];
    for (let i = 0; i < 50; i++) {
      points.push([0, 0, (i / 49) * 2]);
    }
    points.push([0, 0, 10]);

    const result = fitCuboidHeightToPoints(baseTransform, [makeCloud(points)]);

    // Top tracks the cluster (~2), not the outlier (10).
    expect(result.dimensions[2]).toBeLessThan(3);
    expect(result.location[2]).toBeLessThan(1.5);
  });
});
