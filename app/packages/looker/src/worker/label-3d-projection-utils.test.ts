import { describe, expect, it } from "vitest";
import {
  Vec3,
  remap,
  getProjectionPlaneForNormal,
  convertDetectionToBbox3D,
  calculateBoundingBoxProjectionAndConvexHull,
  getLocalBoundingBoxCorners3D,
  translatePoint,
  ProjectionPlane,
  Detection3D,
  BoundingBox3D,
  getGlobalPointsForCube,
  getCubeCorners,
} from "./label-3d-projection-utils";
import { create } from "lodash";

// custom-matchers.ts
const epsilon = 1e-10;

const isApproximatelyEqual = (
  a: number,
  b: number,
  epsilon = 1e-10
): boolean => {
  return Math.abs(a - b) < epsilon;
};

const arraysAreApproximatelyEqual = (
  arr1: number[],
  arr2: number[],
  epsilon = 1e-10
): boolean => {
  if (arr1.length !== arr2.length) {
    return false;
  }
  for (let i = 0; i < arr1.length; i++) {
    if (!isApproximatelyEqual(arr1[i], arr2[i], epsilon)) {
      return false;
    }
  }
  return true;
};
const toBeApproximatelyEqualDeepArray = function (
  this,
  received,
  expected,
  epsilon = 1e-10
) {
  const pass =
    received.length === expected.length &&
    received.every((arr, index) =>
      arraysAreApproximatelyEqual(arr, expected[index], epsilon)
    );

  if (pass) {
    return {
      message: () =>
        `expected ${this.utils.printReceived(
          received
        )} not to be approximately equal to ${this.utils.printExpected(
          expected
        )} within ${epsilon}`,
      pass: true,
    };
  } else {
    return {
      message: () =>
        `expected ${this.utils.printReceived(
          received
        )} to be approximately equal to ${this.utils.printExpected(
          expected
        )} within ${epsilon}`,
      pass: false,
    };
  }
};

expect.extend({
  toBeApproximatelyEqualDeepArray,
});

describe("remap", () => {
  it("should remap a value from one range to another", () => {
    expect(remap(5, 0, 10, 0, 100)).toBe(50);
    expect(remap(0, 0, 10, 0, 100)).toBe(0);
    expect(remap(10, 0, 10, 0, 100)).toBe(100);
    expect(remap(5, 0, 10, 100, 200)).toBe(150);
  });

  it("should handle negative ranges", () => {
    expect(remap(-5, -10, 0, 0, 100)).toBe(50);
    expect(remap(-10, -10, 0, 0, 100)).toBe(0);
    expect(remap(0, -10, 0, 0, 100)).toBe(100);
  });

  it("should handle reverse ranges", () => {
    expect(remap(5, 0, 10, 100, 0)).toBe(50);
    expect(remap(0, 0, 10, 100, 0)).toBe(100);
    expect(remap(10, 0, 10, 100, 0)).toBe(0);
  });

  it("should handle out-of-bounds values", () => {
    expect(remap(-5, 0, 10, 0, 100)).toBe(-50);
    expect(remap(15, 0, 10, 0, 100)).toBe(150);
  });
});

describe("calculateBoundingBoxProjectionAndConvexHull", () => {
  it("should correctly calculate the convex hull for a bounding box in the xy plane", () => {
    const orthographicProjectionParams = {
      min_bound: [-10, -10, -10] as Vec3,
      max_bound: [10, 10, 10] as Vec3,
      normal: [0, 0, 1] as Vec3,
      height: 512,
      width: 512,
    };

    const label = {
      location: [0, 0, 0] as Vec3,
      dimensions: [4, 2, 2] as Vec3,
      rotation: [0, 0, 0] as Vec3,
    };

    const convexHull = calculateBoundingBoxProjectionAndConvexHull(
      orthographicProjectionParams,
      label
    );
    expect(convexHull).toBeInstanceOf(Array);
    expect(convexHull.length).toBeGreaterThan(0);
  });

  it("should correctly calculate the convex hull for a bounding box in the xz plane", () => {
    const orthographicProjectionParams = {
      min_bound: [-10, -10, -10] as Vec3,
      max_bound: [10, 10, 10] as Vec3,
      normal: [0, 1, 0] as Vec3,
      height: 512,
      width: 512,
    };

    const label = {
      location: [0, 0, 0] as Vec3,
      dimensions: [4, 2, 2] as Vec3,
      rotation: [0, 0, 0] as Vec3,
    };

    const convexHull = calculateBoundingBoxProjectionAndConvexHull(
      orthographicProjectionParams,
      label
    );
    expect(convexHull).toBeInstanceOf(Array);
    expect(convexHull.length).toBeGreaterThan(0);
  });

  it("should correctly calculate the convex hull for a bounding box in the yz plane", () => {
    const orthographicProjectionParams = {
      min_bound: [-10, -10, -10] as Vec3,
      max_bound: [10, 10, 10] as Vec3,
      normal: [1, 0, 0] as Vec3,
      height: 512,
      width: 512,
    };

    const label = {
      location: [0, 0, 0] as Vec3,
      dimensions: [4, 2, 2] as Vec3,
      rotation: [0, 0, 0] as Vec3,
    };

    const convexHull = calculateBoundingBoxProjectionAndConvexHull(
      orthographicProjectionParams,
      label
    );
    expect(convexHull).toBeInstanceOf(Array);
    expect(convexHull.length).toBeGreaterThan(0);
  });

  it("should handle bounding boxes partially off-screen", () => {
    const orthographicProjectionParams = {
      min_bound: [-10, -10, -10] as Vec3,
      max_bound: [10, 10, 10] as Vec3,
      normal: [0, 0, 1] as Vec3,
      height: 512,
      width: 512,
    };

    const label = {
      location: [8, 8, 0] as Vec3,
      dimensions: [4, 2, 2] as Vec3,
      rotation: [0, 0, 0] as Vec3,
    };

    const convexHull = calculateBoundingBoxProjectionAndConvexHull(
      orthographicProjectionParams,
      label
    );
    expect(convexHull).toBeInstanceOf(Array);
    expect(convexHull.length).toBeGreaterThan(0);
  });
});

describe("getProjectionPlaneForNormal", () => {
  it("should return yz for a normal of [1, 0, 0]", () => {
    const normal: Vec3 = [1, 0, 0];
    const plane = getProjectionPlaneForNormal(normal);
    expect(plane).toBe("yz");
  });

  it("should return xz for a normal of [0, 1, 0]", () => {
    const normal: Vec3 = [0, 1, 0];
    const plane = getProjectionPlaneForNormal(normal);
    expect(plane).toBe("xz");
  });

  it("should return xy for a normal of [0, 0, 1]", () => {
    const normal: Vec3 = [0, 0, 1];
    const plane = getProjectionPlaneForNormal(normal);
    expect(plane).toBe("xy");
  });
});

describe("convertDetectionToBbox3D", () => {
  it("should convert a detection to a bounding box 3D", () => {
    const detection: Detection3D = {
      location: [1, 2, 3],
      dimensions: [4, 5, 6],
      rotation: [0.1, 0.2, 0.3],
    };
    const bbox3D = convertDetectionToBbox3D(detection);
    expect(bbox3D).toEqual({
      dimensions: [4, 5, 6],
      location: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
    });
  });

  it("should handle optional rotation", () => {
    const detection: Detection3D = {
      location: [1, 2, 3],
      dimensions: [4, 5, 6],
    };
    const bbox3D = convertDetectionToBbox3D(detection);
    expect(bbox3D).toEqual({
      dimensions: [4, 5, 6],
      location: [1, 2, 3],
      rotation: [0, 0, 0],
    });
  });
});

describe("getProjectionPlaneForNormal", () => {
  it("should return yz for a normal of [1, 0, 0]", () => {
    const normal: Vec3 = [1, 0, 0];
    const plane = getProjectionPlaneForNormal(normal);
    expect(plane).toBe(ProjectionPlane.YZ);
  });

  it("should return xz for a normal of [0, 1, 0]", () => {
    const normal: Vec3 = [0, 1, 0];
    const plane = getProjectionPlaneForNormal(normal);
    expect(plane).toBe(ProjectionPlane.XZ);
  });

  it("should return xy for a normal of [0, 0, 1]", () => {
    const normal: Vec3 = [0, 0, 1];
    const plane = getProjectionPlaneForNormal(normal);
    expect(plane).toBe(ProjectionPlane.XY);
  });
});

describe("convertDetectionToBbox3D", () => {
  it("should convert a detection to a bounding box 3D", () => {
    const detection: Detection3D = {
      location: [1, 2, 3],
      dimensions: [4, 5, 6],
      rotation: [0.1, 0.2, 0.3],
    };
    const bbox3D = convertDetectionToBbox3D(detection);
    expect(bbox3D).toEqual({
      dimensions: [4, 5, 6],
      location: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
    });
  });

  it("should handle optional rotation", () => {
    const detection: Detection3D = {
      location: [1, 2, 3],
      dimensions: [4, 5, 6],
    };
    const bbox3D = convertDetectionToBbox3D(detection);
    expect(bbox3D).toEqual({
      dimensions: [4, 5, 6],
      location: [1, 2, 3],
      rotation: [0, 0, 0],
    });
  });
});

describe("calculateBoundingBoxProjectionAndConvexHull", () => {
  it("should correctly calculate the convex hull for a bounding box in the xy plane", () => {
    const orthographicProjectionParams = {
      min_bound: [-10, -10, -10] as Vec3,
      max_bound: [10, 10, 10] as Vec3,
      normal: [0, 0, 1] as Vec3,
      height: 512,
      width: 512,
    };

    const label = {
      location: [0, 0, 0] as Vec3,
      dimensions: [4, 2, 2] as Vec3,
      rotation: [0, 0, 0] as Vec3,
    };

    const convexHull = calculateBoundingBoxProjectionAndConvexHull(
      orthographicProjectionParams,
      label
    );
    expect(convexHull).toBeInstanceOf(Array);
    expect(convexHull.length).toBeGreaterThan(0);
  });

  it("should correctly calculate the convex hull for a bounding box in the xz plane", () => {
    const orthographicProjectionParams = {
      min_bound: [-10, -10, -10] as Vec3,
      max_bound: [10, 10, 10] as Vec3,
      normal: [0, 1, 0] as Vec3,
      height: 512,
      width: 512,
    };

    const label = {
      location: [0, 0, 0] as Vec3,
      dimensions: [4, 2, 2] as Vec3,
      rotation: [0, 0, 0] as Vec3,
    };

    const convexHull = calculateBoundingBoxProjectionAndConvexHull(
      orthographicProjectionParams,
      label
    );
    expect(convexHull).toBeInstanceOf(Array);
    expect(convexHull.length).toBeGreaterThan(0);
  });

  it("should correctly calculate the convex hull for a bounding box in the yz plane", () => {
    const orthographicProjectionParams = {
      min_bound: [-10, -10, -10] as Vec3,
      max_bound: [10, 10, 10] as Vec3,
      normal: [1, 0, 0] as Vec3,
      height: 512,
      width: 512,
    };

    const label = {
      location: [0, 0, 0] as Vec3,
      dimensions: [4, 2, 2] as Vec3,
      rotation: [0, 0, 0] as Vec3,
    };

    const convexHull = calculateBoundingBoxProjectionAndConvexHull(
      orthographicProjectionParams,
      label
    );
    expect(convexHull).toBeInstanceOf(Array);
    expect(convexHull.length).toBeGreaterThan(0);
  });

  it("should handle bounding boxes partially off-screen", () => {
    const orthographicProjectionParams = {
      min_bound: [-10, -10, -10] as Vec3,
      max_bound: [10, 10, 10] as Vec3,
      normal: [0, 0, 1] as Vec3,
      height: 512,
      width: 512,
    };

    const label = {
      location: [8, 8, 0] as Vec3,
      dimensions: [4, 2, 2] as Vec3,
      rotation: [0, 0, 0] as Vec3,
    };

    const convexHull = calculateBoundingBoxProjectionAndConvexHull(
      orthographicProjectionParams,
      label
    );
    expect(convexHull).toBeInstanceOf(Array);
    expect(convexHull.length).toBeGreaterThan(0);
  });
});

describe("getBoundingBox3DCorners", () => {
  it("should generate 8 corners of a bounding box", () => {
    const box: BoundingBox3D = {
      dimensions: [2, 2, 2],
      location: [0, 0, 0],
      rotation: [0, 0, 0],
    };
    const corners = getLocalBoundingBoxCorners3D(box);
    expect(corners).toEqual([
      [-1, -1, -1],
      [-1, -1, 1],
      [-1, 1, -1],
      [-1, 1, 1],
      [1, -1, -1],
      [1, -1, 1],
      [1, 1, -1],
      [1, 1, 1],
    ]);
  });
});

describe("translatePoint", () => {
  it("should translate a point correctly", () => {
    const point: Vec3 = [1, 1, 1];
    const translation: Vec3 = [1, 2, 3];
    const translatedPoint = translatePoint(point, translation);
    expect(arraysAreApproximatelyEqual(translatedPoint, [2, 3, 4])).toBe(true);
  });
});

describe("getGlobalPointsForCube", () => {
  it("should rotate cube corners correctly", () => {
    const origin: Vec3 = [1, 1, 1];
    const CUBE_SIZE = 1;
    const corners: Vec3[] = [
      [-CUBE_SIZE / 2, CUBE_SIZE / 2, -CUBE_SIZE / 2],
      [CUBE_SIZE / 2, CUBE_SIZE / 2, -CUBE_SIZE / 2],
      [-CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2],
      [CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2],
      [-CUBE_SIZE / 2, CUBE_SIZE / 2, CUBE_SIZE / 2],
      [CUBE_SIZE / 2, CUBE_SIZE / 2, CUBE_SIZE / 2],
      [-CUBE_SIZE / 2, -CUBE_SIZE / 2, CUBE_SIZE / 2],
      [CUBE_SIZE / 2, -CUBE_SIZE / 2, CUBE_SIZE / 2],
    ];
    const rotation: Vec3 = [0, 0, Math.PI / 2];
    const globalPoints = getGlobalPointsForCube(origin, corners, rotation);
    const expectedPoints: Vec3[] = [
      [1 - CUBE_SIZE / 2, 1 - CUBE_SIZE / 2, 1 - CUBE_SIZE / 2], // BACK_TOP_LEFT
      [1 - CUBE_SIZE / 2, 1 + CUBE_SIZE / 2, 1 - CUBE_SIZE / 2], // BACK_TOP_RIGHT
      [1 + CUBE_SIZE / 2, 1 - CUBE_SIZE / 2, 1 - CUBE_SIZE / 2], // BACK_BOTTOM_LEFT
      [1 + CUBE_SIZE / 2, 1 + CUBE_SIZE / 2, 1 - CUBE_SIZE / 2], // BACK_BOTTOM_RIGHT
      [1 - CUBE_SIZE / 2, 1 - CUBE_SIZE / 2, 1 + CUBE_SIZE / 2], // FRONT_TOP_LEFT
      [1 - CUBE_SIZE / 2, 1 + CUBE_SIZE / 2, 1 + CUBE_SIZE / 2], // FRONT_TOP_RIGHT
      [1 + CUBE_SIZE / 2, 1 - CUBE_SIZE / 2, 1 + CUBE_SIZE / 2], // FRONT_BOTTOM_LEFT
      [1 + CUBE_SIZE / 2, 1 + CUBE_SIZE / 2, 1 + CUBE_SIZE / 2], // FRONT_BOTTOM_RIGHT
    ];
    expect(globalPoints).toBeApproximatelyEqualDeepArray(expectedPoints);
  });

  it("should handle no rotation correctly", () => {
    const origin: Vec3 = [1, 1, 1];
    const corners: Vec3[] = [
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [-0.5, -0.5, 0.5],
      [0.5, -0.5, 0.5],
      [0.5, 0.5, -0.5],
      [-0.5, 0.5, -0.5],
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
    ];
    const rotation: Vec3 = [0, 0, 0];
    const globalPoints = getGlobalPointsForCube(origin, corners, rotation);
    const expectedPoints: Vec3[] = [
      [1.5, 1.5, 1.5],
      [0.5, 1.5, 1.5],
      [0.5, 0.5, 1.5],
      [1.5, 0.5, 1.5],
      [1.5, 1.5, 0.5],
      [0.5, 1.5, 0.5],
      [0.5, 0.5, 0.5],
      [1.5, 0.5, 0.5],
    ];
    expect(globalPoints).toBeApproximatelyEqualDeepArray(expectedPoints);
  });
});

describe("getCubeCorners", () => {
  it("should get global corners for a bounding box", () => {
    const box: BoundingBox3D = {
      dimensions: [1, 1, 1],
      location: [1, 1, 1],
      rotation: [0, 0, Math.PI / 2],
    };

    const globalCorners = getCubeCorners(box);

    const CUBE_SIZE = 1;
    const halfSize = CUBE_SIZE / 2;

    // Calculate the expected points based on the given dimensions, location, and rotation
    const expectedPoints: Vec3[] = [
      [1 - halfSize, 1 - halfSize, 1 - halfSize], // BACK_TOP_LEFT
      [1 - halfSize, 1 + halfSize, 1 - halfSize], // BACK_TOP_RIGHT
      [1 + halfSize, 1 - halfSize, 1 - halfSize], // BACK_BOTTOM_LEFT
      [1 + halfSize, 1 + halfSize, 1 - halfSize], // BACK_BOTTOM_RIGHT
      [1 - halfSize, 1 - halfSize, 1 + halfSize], // FRONT_TOP_LEFT
      [1 - halfSize, 1 + halfSize, 1 + halfSize], // FRONT_TOP_RIGHT
      [1 + halfSize, 1 - halfSize, 1 + halfSize], // FRONT_BOTTOM_LEFT
      [1 + halfSize, 1 + halfSize, 1 + halfSize], // FRONT_BOTTOM_RIGHT
    ];

    expect(globalCorners).toBeApproximatelyEqualDeepArray(
      expectedPoints,
      0.0001
    );
  });

  it("should handle no rotation correctly", () => {
    const box: BoundingBox3D = {
      dimensions: [1, 1, 1],
      location: [1, 1, 1],
      rotation: [0, 0, 0],
    };
    const globalCorners = getCubeCorners(box);
    const expectedPoints: Vec3[] = [
      [1.5, 1.5, 1.5],
      [0.5, 1.5, 1.5],
      [0.5, 0.5, 1.5],
      [1.5, 0.5, 1.5],
      [1.5, 1.5, 0.5],
      [0.5, 1.5, 0.5],
      [0.5, 0.5, 0.5],
      [1.5, 0.5, 0.5],
    ];
    expect(globalCorners).toBeApproximatelyEqualDeepArray(expectedPoints);
  });
});
