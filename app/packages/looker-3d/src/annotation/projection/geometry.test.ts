import { Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { CameraIntrinsics, FrustumData } from "../../frustum/types";
import type { CuboidTransformData } from "../types";
import {
  CUBOID_EDGES,
  computeCuboidProjection,
  getCuboidWorldCorners,
  projectToPixel,
} from "./geometry";

const IDENTITY_TRANSFORM = {
  translation: [0, 0, 0] as [number, number, number],
  quaternion: [0, 0, 0, 1] as [number, number, number, number],
};

/** Simple pinhole intrinsics (640x480, centered principal point). */
const SIMPLE_INTRINSICS: CameraIntrinsics = {
  fx: 500,
  fy: 500,
  cx: 320,
  cy: 240,
  width: 640,
  height: 480,
};

function makeFrustumData(
  intrinsics: CameraIntrinsics | null = SIMPLE_INTRINSICS,
  staticTransform = IDENTITY_TRANSFORM
): FrustumData {
  return {
    sliceName: "test",
    intrinsics,
    staticTransform,
  };
}

describe("CUBOID_EDGES", () => {
  it("has 12 edges", () => {
    expect(CUBOID_EDGES).toHaveLength(12);
  });

  it("references only indices 0-7", () => {
    for (const [i, j] of CUBOID_EDGES) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(8);
      expect(j).toBeGreaterThanOrEqual(0);
      expect(j).toBeLessThan(8);
    }
  });
});

describe("getCuboidWorldCorners", () => {
  it("returns 8 corners", () => {
    const corners = getCuboidWorldCorners([0, 0, 0], [2, 2, 2]);
    expect(corners).toHaveLength(8);
  });

  it("places a unit cube at the origin with correct extents", () => {
    const corners = getCuboidWorldCorners([0, 0, 0], [2, 2, 2]);

    for (const c of corners) {
      expect(Math.abs(c.x)).toBeCloseTo(1);
      expect(Math.abs(c.y)).toBeCloseTo(1);
      expect(Math.abs(c.z)).toBeCloseTo(1);
    }
  });

  it("offsets corners by location", () => {
    const corners = getCuboidWorldCorners([10, 20, 30], [2, 2, 2]);

    const center = corners
      .reduce((acc, c) => acc.add(c), new Vector3())
      .divideScalar(8);

    expect(center.x).toBeCloseTo(10);
    expect(center.y).toBeCloseTo(20);
    expect(center.z).toBeCloseTo(30);
  });

  it("applies euler rotation", () => {
    // 90 degrees around Z axis
    const corners = getCuboidWorldCorners(
      [0, 0, 0],
      [2, 0, 0],
      [0, 0, Math.PI / 2]
    );

    // A cuboid of dimensions [2,0,0] has corners at x=+-1 before rotation.
    // After 90deg Z rotation, those should move to y=+-1.
    const maxY = Math.max(...corners.map((c) => Math.abs(c.y)));
    expect(maxY).toBeCloseTo(1);
  });

  it("applies quaternion rotation", () => {
    // 90 degrees around Z via quaternion [0, 0, sin(45°), cos(45°)]
    const s = Math.SQRT1_2;
    const corners = getCuboidWorldCorners([0, 0, 0], [2, 0, 0], undefined, [
      0,
      0,
      s,
      s,
    ]);

    const maxY = Math.max(...corners.map((c) => Math.abs(c.y)));
    expect(maxY).toBeCloseTo(1);
  });

  it("prefers quaternion over rotation when both are provided", () => {
    const s = Math.SQRT1_2;
    // quaternion: 90deg around Z; rotation: 0 (no-op)
    const corners = getCuboidWorldCorners(
      [0, 0, 0],
      [2, 0, 0],
      // would produce no rotation
      [0, 0, 0],
      // 90deg around Z
      [0, 0, s, s]
    );

    const maxY = Math.max(...corners.map((c) => Math.abs(c.y)));
    expect(maxY).toBeCloseTo(1);
  });
});

describe("projectToPixel", () => {
  // world-to-cam = identity
  const identity = new Matrix4();

  it("projects a point directly in front of the camera to the principal point", () => {
    const point = new Vector3(0, 0, 5);
    const result = projectToPixel(point, identity, SIMPLE_INTRINSICS);

    expect(result).not.toBeNull();
    expect(result!.u).toBeCloseTo(SIMPLE_INTRINSICS.cx);
    expect(result!.v).toBeCloseTo(SIMPLE_INTRINSICS.cy);
    expect(result!.z).toBeCloseTo(5);
  });

  it("returns null for points behind the camera", () => {
    const point = new Vector3(0, 0, -5);
    const result = projectToPixel(point, identity, SIMPLE_INTRINSICS);
    expect(result).toBeNull();
  });

  it("returns null for points at z=0", () => {
    const point = new Vector3(1, 1, 0);
    const result = projectToPixel(point, identity, SIMPLE_INTRINSICS);
    expect(result).toBeNull();
  });

  it("projects off-center points correctly", () => {
    // Point 1 unit to the right and 1 unit deep
    const point = new Vector3(1, 0, 1);
    const result = projectToPixel(point, identity, SIMPLE_INTRINSICS);

    expect(result).not.toBeNull();
    // u = fx * (x/z) + cx = 500 * (1/1) + 320 = 820
    expect(result!.u).toBeCloseTo(820);
    expect(result!.v).toBeCloseTo(240);
  });

  it("applies world-to-camera transform", () => {
    // Camera translated 10 units along Z
    const worldToCam = new Matrix4().makeTranslation(0, 0, -10);
    // 15 in world = 5 in cam
    const point = new Vector3(0, 0, 15);

    const result = projectToPixel(point, worldToCam, SIMPLE_INTRINSICS);

    expect(result).not.toBeNull();
    expect(result!.z).toBeCloseTo(5);
    expect(result!.u).toBeCloseTo(SIMPLE_INTRINSICS.cx);
  });
});

describe("computeCuboidProjection", () => {
  it("returns null when intrinsics are missing", () => {
    const label: CuboidTransformData = {
      location: [0, 0, 5],
      dimensions: [1, 1, 1],
    };
    const frustum = makeFrustumData(null);
    expect(computeCuboidProjection(label, frustum)).toBeNull();
  });

  it("returns null when staticTransform is missing", () => {
    const label: CuboidTransformData = {
      location: [0, 0, 5],
      dimensions: [1, 1, 1],
    };
    const frustum: FrustumData = {
      sliceName: "test",
      intrinsics: SIMPLE_INTRINSICS,
      staticTransform: null,
    };
    expect(computeCuboidProjection(label, frustum)).toBeNull();
  });

  it("projects a cuboid in front of the camera with all 12 edges", () => {
    const label: CuboidTransformData = {
      location: [0, 0, 5],
      dimensions: [1, 1, 1],
    };
    const frustum = makeFrustumData();
    const result = computeCuboidProjection(label, frustum);

    expect(result).not.toBeNull();
    expect(result!.edges).toHaveLength(12);
    expect(result!.corners).toHaveLength(8);
  });

  it("returns null when all corners are behind the camera", () => {
    const label: CuboidTransformData = {
      // behind camera
      location: [0, 0, -5],
      dimensions: [1, 1, 1],
    };
    const frustum = makeFrustumData();
    const result = computeCuboidProjection(label, frustum);

    expect(result).toBeNull();
  });

  it("returns partial edges when cuboid straddles the camera plane", () => {
    // cuboid centered at z=0.3 with depth 1 -> extends from z=-0.2 to z=0.8
    const label: CuboidTransformData = {
      location: [0, 0, 0.3],
      dimensions: [1, 1, 1],
    };
    const frustum = makeFrustumData();
    const result = computeCuboidProjection(label, frustum);

    // Some corners behind camera -> fewer than 12 edges, but not zero
    expect(result).not.toBeNull();
    expect(result!.edges.length).toBeGreaterThan(0);
    expect(result!.edges.length).toBeLessThan(12);
  });

  it("projects to the correct pixel region", () => {
    const label: CuboidTransformData = {
      location: [0, 0, 10],
      dimensions: [1, 1, 1],
    };
    const frustum = makeFrustumData();
    const result = computeCuboidProjection(label, frustum)!;

    // All projected edges should be near the image center (cx=320, cy=240)
    // since the cuboid is centered on the optical axis
    for (const edge of result.edges) {
      expect(edge.x1).toBeGreaterThan(200);
      expect(edge.x1).toBeLessThan(440);
      expect(edge.y1).toBeGreaterThan(120);
      expect(edge.y1).toBeLessThan(360);
    }
  });

  it("handles rotated cuboids", () => {
    const label: CuboidTransformData = {
      location: [0, 0, 5],
      dimensions: [2, 1, 1],
      rotation: [0, Math.PI / 4, 0], // 45° around Y
    };
    const frustum = makeFrustumData();
    const result = computeCuboidProjection(label, frustum);

    expect(result).not.toBeNull();
    expect(result!.edges).toHaveLength(12);
  });

  it("handles quaternion-rotated cuboids", () => {
    const s = Math.SQRT1_2;
    const label: CuboidTransformData = {
      location: [0, 0, 5],
      dimensions: [2, 1, 1],
      // 90deg around Y
      quaternion: [0, s, 0, s],
    };
    const frustum = makeFrustumData();
    const result = computeCuboidProjection(label, frustum);

    expect(result).not.toBeNull();
    expect(result!.edges).toHaveLength(12);
  });
});
