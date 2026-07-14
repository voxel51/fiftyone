import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  computeCuboidFaceResizeDelta,
  getCuboidResizeDimensionMagnitudes,
  getCuboidFaceResizeDragPlaneNormal,
  getCuboidResizeFaceFromNormal,
  getCuboidResizeFaceWorldNormal,
  getCuboidResizeQuaternion,
  isValidCuboidResizeDimensions,
  MIN_CUBOID_FACE_RESIZE_DIMENSION,
  type CuboidResizeFace,
} from "./cuboid-face-resize";

const expectTupleCloseTo = (
  actual: THREE.Vector3Tuple,
  expected: THREE.Vector3Tuple,
) => {
  expect(actual[0]).toBeCloseTo(expected[0]);
  expect(actual[1]).toBeCloseTo(expected[1]);
  expect(actual[2]).toBeCloseTo(expected[2]);
};

const faceAxis = (face: CuboidResizeFace) => {
  if (face.endsWith("x")) return 0;
  if (face.endsWith("y")) return 1;
  return 2;
};

describe("getCuboidResizeFaceFromNormal", () => {
  it("maps local face normals to cuboid resize faces", () => {
    expect(getCuboidResizeFaceFromNormal(new THREE.Vector3(1, 0, 0))).toBe(
      "+x",
    );
    expect(getCuboidResizeFaceFromNormal(new THREE.Vector3(-1, 0, 0))).toBe(
      "-x",
    );
    expect(getCuboidResizeFaceFromNormal(new THREE.Vector3(0, 1, 0))).toBe(
      "+y",
    );
    expect(getCuboidResizeFaceFromNormal(new THREE.Vector3(0, -1, 0))).toBe(
      "-y",
    );
    expect(getCuboidResizeFaceFromNormal(new THREE.Vector3(0, 0, 1))).toBe(
      "+z",
    );
    expect(getCuboidResizeFaceFromNormal(new THREE.Vector3(0, 0, -1))).toBe(
      "-z",
    );
  });

  it("uses the dominant axis and ignores degenerate normals", () => {
    expect(
      getCuboidResizeFaceFromNormal(new THREE.Vector3(0.1, -0.8, 0.3)),
    ).toBe("-y");
    expect(
      getCuboidResizeFaceFromNormal(new THREE.Vector3(0, 0, 0)),
    ).toBeNull();
    expect(getCuboidResizeFaceFromNormal(null)).toBeNull();
  });
});

describe("cuboid resize dimensions", () => {
  it("treats signed dimensions as valid visual magnitudes", () => {
    expect(getCuboidResizeDimensionMagnitudes([1, -2, 3])).toEqual([1, 2, 3]);
    expect(isValidCuboidResizeDimensions([1, -2, 3])).toBe(true);
    expect(isValidCuboidResizeDimensions([1, 0, 3])).toBe(false);
  });
});

describe("computeCuboidFaceResizeDelta", () => {
  it("resizes every face while anchoring the opposite face", () => {
    const dimensions: THREE.Vector3Tuple = [4, 6, 8];
    const dragDistance = 2;
    const faces: CuboidResizeFace[] = ["+x", "-x", "+y", "-y", "+z", "-z"];

    for (const face of faces) {
      const result = computeCuboidFaceResizeDelta({
        face,
        dimensions,
        dragDistance,
      });
      const axis = faceAxis(face);
      const faceWorldNormal = getCuboidResizeFaceWorldNormal(
        face,
        new THREE.Quaternion(),
      );
      const centerDelta = new THREE.Vector3(...result.centerDelta);
      const oldOppositeFaceOffset = -dimensions[axis] / 2;
      const newOppositeFaceOffset =
        centerDelta.dot(faceWorldNormal) - result.resizedDimensions[axis] / 2;

      expect(result.dimensionsDelta[axis]).toBe(dragDistance);
      expect(result.resizedDimensions[axis]).toBe(
        dimensions[axis] + dragDistance,
      );
      expect(newOppositeFaceOffset).toBeCloseTo(oldOppositeFaceOffset);
    }
  });

  it("expands and contracts only the dragged face axis", () => {
    expect(
      computeCuboidFaceResizeDelta({
        face: "+x",
        dimensions: [4, 6, 8],
        dragDistance: 3,
      }).dimensionsDelta,
    ).toEqual([3, 0, 0]);

    expect(
      computeCuboidFaceResizeDelta({
        face: "-z",
        dimensions: [4, 6, 8],
        dragDistance: -3,
      }).dimensionsDelta,
    ).toEqual([0, 0, -3]);
  });

  it("clamps dimensions before computing center movement", () => {
    const result = computeCuboidFaceResizeDelta({
      face: "+x",
      dimensions: [4, 6, 8],
      dragDistance: -20,
    });

    expect(result.resizedDimensions[0]).toBeCloseTo(
      MIN_CUBOID_FACE_RESIZE_DIMENSION,
    );
    expect(result.dimensionsDelta[0]).toBeCloseTo(
      MIN_CUBOID_FACE_RESIZE_DIMENSION - 4,
    );
    expect(result.centerDelta[0]).toBeCloseTo(
      (MIN_CUBOID_FACE_RESIZE_DIMENSION - 4) / 2,
    );
  });

  it("preserves signed dimensions while resizing by visual magnitude", () => {
    const result = computeCuboidFaceResizeDelta({
      face: "+z",
      dimensions: [4, 6, -8],
      dragDistance: 2,
    });

    expect(result.dimensionsDelta).toEqual([0, 0, -2]);
    expect(result.resizedDimensions).toEqual([4, 6, -10]);
    expectTupleCloseTo(result.centerDelta, [0, 0, 1]);
  });

  it("uses quaternion orientation for local face movement", () => {
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, 0, Math.PI / 2),
    );
    const result = computeCuboidFaceResizeDelta({
      face: "+x",
      dimensions: [4, 6, 8],
      dragDistance: 2,
      quaternion: quaternion.toArray(),
    });

    expectTupleCloseTo(result.centerDelta, [0, 1, 0]);
    expectTupleCloseTo(result.positionDelta, [0, 1, 0]);
    expect(result.dimensionsDelta).toEqual([2, 0, 0]);
  });

  it("falls back to Euler rotation when quaternion is unavailable", () => {
    const orientation = getCuboidResizeQuaternion({
      rotation: [0, 0, Math.PI / 2],
    });
    const result = computeCuboidFaceResizeDelta({
      face: "+x",
      dimensions: [4, 6, 8],
      dragDistance: 2,
      rotation: [0, 0, Math.PI / 2],
    });

    expectTupleCloseTo(
      getCuboidResizeFaceWorldNormal("+x", orientation).toArray(),
      [0, 1, 0],
    );
    expectTupleCloseTo(result.centerDelta, [0, 1, 0]);
  });

  it("converts center deltas to legacy top-center position deltas", () => {
    const expandTop = computeCuboidFaceResizeDelta({
      face: "+y",
      dimensions: [4, 6, 8],
      dragDistance: 2,
      useLegacyCoordinates: true,
    });
    const expandBottom = computeCuboidFaceResizeDelta({
      face: "-y",
      dimensions: [4, 6, 8],
      dragDistance: 2,
      useLegacyCoordinates: true,
    });

    expectTupleCloseTo(expandTop.centerDelta, [0, 1, 0]);
    expectTupleCloseTo(expandTop.positionDelta, [0, 2, 0]);
    expectTupleCloseTo(expandBottom.centerDelta, [0, -1, 0]);
    expectTupleCloseTo(expandBottom.positionDelta, [0, 0, 0]);
  });
});

describe("getCuboidFaceResizeDragPlaneNormal", () => {
  it("returns a usable plane normal that contains the face normal", () => {
    const faceWorldNormal = new THREE.Vector3(1, 0, 0);
    const result = getCuboidFaceResizeDragPlaneNormal({
      faceWorldNormal,
      cameraDirection: new THREE.Vector3(0, 0, -1),
      cameraUp: new THREE.Vector3(0, 1, 0),
    });

    expect(result.length()).toBeCloseTo(1);
    expect(result.dot(faceWorldNormal)).toBeCloseTo(0);
  });

  it("falls back when the camera direction is parallel to the face normal", () => {
    const faceWorldNormal = new THREE.Vector3(1, 0, 0);
    const result = getCuboidFaceResizeDragPlaneNormal({
      faceWorldNormal,
      cameraDirection: new THREE.Vector3(1, 0, 0),
      cameraUp: new THREE.Vector3(0, 1, 0),
    });

    expect(result.length()).toBeCloseTo(1);
    expect(result.dot(faceWorldNormal)).toBeCloseTo(0);
  });
});
