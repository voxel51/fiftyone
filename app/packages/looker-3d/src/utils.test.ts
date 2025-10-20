import {
  BufferAttribute,
  PerspectiveCamera,
  Plane,
  Quaternion,
  Raycaster,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { COLOR_POOL } from "./constants";
import {
  computeMinMaxForColorBufferAttribute,
  computeMinMaxForScalarBufferAttribute,
  createPlane,
  deg2rad,
  eulerToQuaternion,
  getColorFromPoolBasedOnHash,
  getGridQuaternionFromUpVector,
  getPlaneFromPositionAndQuaternion,
  getPlaneIntersection,
  quaternionToEuler,
  toEulerFromDegreesArray,
  toNDC,
} from "./utils";

describe("deg2rad", () => {
  it("converts degrees to radians", () => {
    expect(deg2rad(0)).toBe(0);
    expect(deg2rad(180)).toBeCloseTo(Math.PI);
    expect(deg2rad(90)).toBeCloseTo(Math.PI / 2);
  });
});

describe("toEulerFromDegreesArray", () => {
  it("converts array of degrees to radians", () => {
    expect(toEulerFromDegreesArray([0, 90, 180])).toEqual([
      0,
      Math.PI / 2,
      Math.PI,
    ]);
  });
});

describe("computeMinMaxForColorBufferAttribute", () => {
  it("computes min and max for color attribute", () => {
    const attr = new BufferAttribute(new Float32Array([1, 2, 3, 4, 5, 6]), 1);
    expect(computeMinMaxForColorBufferAttribute(attr)).toEqual({
      min: 1,
      max: 6,
    });
  });
  it("handles all negative values", () => {
    const attr = new BufferAttribute(new Float32Array([-1, -2, -3]), 1);
    expect(computeMinMaxForColorBufferAttribute(attr)).toEqual({
      min: -3,
      max: -1,
    });
  });
});

describe("computeMinMaxForScalarBufferAttribute", () => {
  it("computes min and max for scalar attribute", () => {
    const attr = new BufferAttribute(new Float32Array([1, 2, 3, 4, 5, 6]), 1);
    expect(computeMinMaxForScalarBufferAttribute(attr)).toEqual({
      min: 1,
      max: 6,
    });
  });
  it("handles negative values", () => {
    const attr = new BufferAttribute(new Float32Array([-1, -2, -3, 0]), 1);
    expect(computeMinMaxForScalarBufferAttribute(attr)).toEqual({
      min: -3,
      max: 0,
    });
  });
  it("handles empty array", () => {
    const attr = new BufferAttribute(new Float32Array([]), 1);
    expect(computeMinMaxForScalarBufferAttribute(attr)).toEqual({
      min: Infinity,
      max: -Infinity,
    });
  });
});

describe("getColorFromPoolBasedOnHash", () => {
  it("returns a color from COLOR_POOL based on hash", () => {
    expect(COLOR_POOL).toContain(getColorFromPoolBasedOnHash("test"));
    expect(COLOR_POOL).toContain(getColorFromPoolBasedOnHash("another"));
    expect(COLOR_POOL).toContain(getColorFromPoolBasedOnHash(""));
  });
  it("returns same color for same string", () => {
    expect(getColorFromPoolBasedOnHash("repeat")).toBe(
      getColorFromPoolBasedOnHash("repeat")
    );
  });
});

describe("getGridQuaternionFromUpVector", () => {
  it("returns identity quaternion when up vector matches target normal", () => {
    const up = new Vector3(0, 1, 0);
    const result = getGridQuaternionFromUpVector(up);
    expect(result).toBeInstanceOf(Quaternion);
    expect(result.w).toBeCloseTo(1);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(0);
  });

  it("handles antiparallel up vector (opposite direction)", () => {
    const up = new Vector3(0, -1, 0); // Opposite to target normal (0, 1, 0)
    const result = getGridQuaternionFromUpVector(up);
    expect(result).toBeInstanceOf(Quaternion);
    // Should not be zero quaternion (0, 0, 0, 0) - at least one component should be non-zero
    const hasNonZeroComponent =
      result.w !== 0 || result.x !== 0 || result.y !== 0 || result.z !== 0;
    expect(hasNonZeroComponent).toBe(true);
    // Verify it's a valid quaternion (magnitude should be 1)
    const magnitude = Math.sqrt(
      result.w * result.w +
        result.x * result.x +
        result.y * result.y +
        result.z * result.z
    );
    expect(magnitude).toBeCloseTo(1);
    const targetNormal = new Vector3(0, 1, 0);
    const rotated = up.clone().applyQuaternion(result);
    expect(rotated.x).toBeCloseTo(targetNormal.x);
    expect(rotated.y).toBeCloseTo(targetNormal.y);
    expect(rotated.z).toBeCloseTo(targetNormal.z);
  });

  it("handles arbitrary up vector", () => {
    const up = new Vector3(1, 0, 0).normalize();
    const result = getGridQuaternionFromUpVector(up);
    expect(result).toBeInstanceOf(Quaternion);
    // Should not be zero quaternion
    expect(result.w).not.toBe(0);
    // Verify it's a valid quaternion
    const magnitude = Math.sqrt(
      result.w * result.w +
        result.x * result.x +
        result.y * result.y +
        result.z * result.z
    );
    expect(magnitude).toBeCloseTo(1);
  });

  it("handles diagonal up vector", () => {
    const up = new Vector3(1, 1, 0).normalize();
    const result = getGridQuaternionFromUpVector(up);
    expect(result).toBeInstanceOf(Quaternion);
    // Should not be zero quaternion
    expect(result.w).not.toBe(0);
    // Verify it's a valid quaternion
    const magnitude = Math.sqrt(
      result.w * result.w +
        result.x * result.x +
        result.y * result.y +
        result.z * result.z
    );
    expect(magnitude).toBeCloseTo(1);
  });

  it("handles custom target normal", () => {
    const up = new Vector3(0, 0, 1);
    const targetNormal = new Vector3(0, 0, 1);
    const result = getGridQuaternionFromUpVector(up, targetNormal);
    expect(result).toBeInstanceOf(Quaternion);
    // Should be identity quaternion when vectors match
    expect(result.w).toBeCloseTo(1);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(0);
  });

  it("handles antiparallel with custom target normal", () => {
    const up = new Vector3(0, 0, -1);
    const targetNormal = new Vector3(0, 0, 1);
    const result = getGridQuaternionFromUpVector(up, targetNormal);
    expect(result).toBeInstanceOf(Quaternion);
    // Should not be zero quaternion (0, 0, 0, 0) - at least one component should be non-zero
    const hasNonZeroComponent =
      result.w !== 0 || result.x !== 0 || result.y !== 0 || result.z !== 0;
    expect(hasNonZeroComponent).toBe(true);
    // Verify it's a valid quaternion (magnitude should be 1)
    const magnitude = Math.sqrt(
      result.w * result.w +
        result.x * result.x +
        result.y * result.y +
        result.z * result.z
    );
    expect(magnitude).toBeCloseTo(1);
    const rotated = up.clone().applyQuaternion(result);
    expect(rotated.x).toBeCloseTo(targetNormal.x);
    expect(rotated.y).toBeCloseTo(targetNormal.y);
    expect(rotated.z).toBeCloseTo(targetNormal.z);
  });
});

describe("toNDC", () => {
  it("converts pointer event to normalized device coordinates", () => {
    const mockCanvas = {
      getBoundingClientRect: vi.fn().mockReturnValue({
        left: 100,
        top: 50,
        width: 800,
        height: 600,
      }),
    } as unknown as HTMLCanvasElement;

    const mockEvent = {
      clientX: 500,
      clientY: 350,
    } as PointerEvent;

    const result = toNDC(mockEvent, mockCanvas);

    // Center of canvas should be (0, 0) in NDC
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
  });

  it("converts corner coordinates correctly", () => {
    const mockCanvas = {
      getBoundingClientRect: vi.fn().mockReturnValue({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      }),
    } as unknown as HTMLCanvasElement;

    // Top-left corner
    const topLeftEvent = {
      clientX: 0,
      clientY: 0,
    } as PointerEvent;
    const topLeftResult = toNDC(topLeftEvent, mockCanvas);
    expect(topLeftResult.x).toBeCloseTo(-1);
    expect(topLeftResult.y).toBeCloseTo(1);

    // Bottom-right corner
    const bottomRightEvent = {
      clientX: 100,
      clientY: 100,
    } as PointerEvent;
    const bottomRightResult = toNDC(bottomRightEvent, mockCanvas);
    expect(bottomRightResult.x).toBeCloseTo(1);
    expect(bottomRightResult.y).toBeCloseTo(-1);
  });
});

describe("createPlane", () => {
  it("creates a plane with normalized normal and negative constant", () => {
    const normal = new Vector3(2, 0, 0);
    const constant = 5;
    const plane = createPlane(normal, constant);

    expect(plane).toBeInstanceOf(Plane);
    expect(plane.normal.x).toBeCloseTo(1);
    expect(plane.normal.y).toBeCloseTo(0);
    expect(plane.normal.z).toBeCloseTo(0);
    expect(plane.constant).toBe(-5);
  });
});

describe("getPlaneIntersection", () => {
  it("returns intersection point when ray intersects plane", () => {
    const raycaster = new Raycaster();
    const camera = new PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    // XY plane at z=0
    const plane = new Plane(new Vector3(0, 0, 1), 0);
    // Center of screen
    const ndc = { x: 0, y: 0 };

    const result = getPlaneIntersection(raycaster, camera, ndc, plane);

    expect(result).toBeInstanceOf(Vector3);
    expect(result?.x).toBeCloseTo(0);
    expect(result?.y).toBeCloseTo(0);
    expect(result?.z).toBeCloseTo(0);
  });

  it("returns null when ray does not intersect plane", () => {
    const raycaster = new Raycaster();
    const camera = new PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    // Create a plane that the ray will miss - plane is behind the camera and ray goes forward
    // XY plane at z=-10 (behind camera)
    const plane = new Plane(new Vector3(0, 0, -1), 10);
    // Center of screen - ray goes forward from z=5 to z=0
    const ndc = { x: 0, y: 0 };

    const result = getPlaneIntersection(raycaster, camera, ndc, plane);

    expect(result).toBeNull();
  });
});

describe("getPlaneFromPositionAndQuaternion", () => {
  it("creates plane with identity quaternion at origin", () => {
    const position: [number, number, number] = [0, 0, 0];
    const quaternion: [number, number, number, number] = [0, 0, 0, 1];
    const result = getPlaneFromPositionAndQuaternion(position, quaternion);

    expect(result).toBeInstanceOf(Plane);
    expect(result.normal.x).toBeCloseTo(0);
    expect(result.normal.y).toBeCloseTo(0);
    expect(result.normal.z).toBeCloseTo(1);
    expect(result.constant).toBeCloseTo(0);
  });

  it("creates plane with identity quaternion at offset position", () => {
    const position: [number, number, number] = [1, 2, 3];
    const quaternion: [number, number, number, number] = [0, 0, 0, 1];
    const result = getPlaneFromPositionAndQuaternion(position, quaternion);

    expect(result).toBeInstanceOf(Plane);
    expect(result.normal.x).toBeCloseTo(0);
    expect(result.normal.y).toBeCloseTo(0);
    expect(result.normal.z).toBeCloseTo(1);
    expect(result.constant).toBeCloseTo(-3);
  });

  it("creates plane with 90-degree rotation around Y-axis", () => {
    const position: [number, number, number] = [0, 0, 0];
    const quaternion: [number, number, number, number] = [
      0,
      Math.sqrt(2) / 2,
      0,
      Math.sqrt(2) / 2,
    ];
    const result = getPlaneFromPositionAndQuaternion(position, quaternion);

    expect(result).toBeInstanceOf(Plane);
    expect(result.normal.x).toBeCloseTo(1);
    expect(result.normal.y).toBeCloseTo(0);
    expect(result.normal.z).toBeCloseTo(0);
    expect(result.constant).toBeCloseTo(0);
  });

  it("creates plane with 90-degree rotation around X-axis", () => {
    const position: [number, number, number] = [0, 0, 0];
    const quaternion: [number, number, number, number] = [
      Math.sqrt(2) / 2,
      0,
      0,
      Math.sqrt(2) / 2,
    ];
    const result = getPlaneFromPositionAndQuaternion(position, quaternion);

    expect(result).toBeInstanceOf(Plane);
    expect(result.normal.x).toBeCloseTo(0);
    expect(result.normal.y).toBeCloseTo(-1);
    expect(result.normal.z).toBeCloseTo(0);
    expect(result.constant).toBeCloseTo(0);
  });

  it("creates plane with 180-degree rotation around X-axis", () => {
    const position: [number, number, number] = [0, 0, 0];
    const quaternion: [number, number, number, number] = [1, 0, 0, 0];
    const result = getPlaneFromPositionAndQuaternion(position, quaternion);

    expect(result).toBeInstanceOf(Plane);
    expect(result.normal.x).toBeCloseTo(0);
    expect(result.normal.y).toBeCloseTo(0);
    expect(result.normal.z).toBeCloseTo(-1);
    expect(result.constant).toBeCloseTo(0);
  });

  it("creates plane with arbitrary rotation and position", () => {
    const position: [number, number, number] = [2, 3, 4];
    const quaternion: [number, number, number, number] = [0.1, 0.2, 0.3, 0.9];
    const result = getPlaneFromPositionAndQuaternion(position, quaternion);

    expect(result).toBeInstanceOf(Plane);
    // Verify the normal is normalized
    const normalMagnitude = Math.sqrt(
      result.normal.x * result.normal.x +
        result.normal.y * result.normal.y +
        result.normal.z * result.normal.z
    );
    expect(normalMagnitude).toBeCloseTo(1);
  });

  it("creates plane with diagonal normal from quaternion", () => {
    const position: [number, number, number] = [0, 0, 0];
    // Quaternion that rotates Z-axis to diagonal direction
    const quaternion: [number, number, number, number] = [0.5, 0.5, 0.5, 0.5];
    const result = getPlaneFromPositionAndQuaternion(position, quaternion);

    expect(result).toBeInstanceOf(Plane);
    // Verify the normal is normalized
    const normalMagnitude = Math.sqrt(
      result.normal.x * result.normal.x +
        result.normal.y * result.normal.y +
        result.normal.z * result.normal.z
    );
    expect(normalMagnitude).toBeCloseTo(1);
  });
});

describe("eulerToQuaternion", () => {
  it("converts zero Euler angles to identity quaternion", () => {
    const eulerAngles: [number, number, number] = [0, 0, 0];
    const result = eulerToQuaternion(eulerAngles);

    expect(result).toEqual([0, 0, 0, 1]);
  });

  it("converts 90 degree X rotation", () => {
    const eulerAngles: [number, number, number] = [90, 0, 0];
    const result = eulerToQuaternion(eulerAngles);

    // For 90 degree X rotation, quaternion should be approximately [0.707, 0, 0, 0.707]
    expect(result[0]).toBeCloseTo(0.707, 2);
    expect(result[1]).toBeCloseTo(0, 2);
    expect(result[2]).toBeCloseTo(0, 2);
    expect(result[3]).toBeCloseTo(0.707, 2);
  });

  it("converts 90 degree Y rotation", () => {
    const eulerAngles: [number, number, number] = [0, 90, 0];
    const result = eulerToQuaternion(eulerAngles);

    // For 90 degree Y rotation, quaternion should be approximately [0, 0.707, 0, 0.707]
    expect(result[0]).toBeCloseTo(0, 2);
    expect(result[1]).toBeCloseTo(0.707, 2);
    expect(result[2]).toBeCloseTo(0, 2);
    expect(result[3]).toBeCloseTo(0.707, 2);
  });

  it("converts 90 degree Z rotation", () => {
    const eulerAngles: [number, number, number] = [0, 0, 90];
    const result = eulerToQuaternion(eulerAngles);

    // For 90 degree Z rotation, quaternion should be approximately [0, 0, 0.707, 0.707]
    expect(result[0]).toBeCloseTo(0, 2);
    expect(result[1]).toBeCloseTo(0, 2);
    expect(result[2]).toBeCloseTo(0.707, 2);
    expect(result[3]).toBeCloseTo(0.707, 2);
  });

  it("converts 180 degree X rotation", () => {
    const eulerAngles: [number, number, number] = [180, 0, 0];
    const result = eulerToQuaternion(eulerAngles);

    // For 180 degree X rotation, quaternion should be [1, 0, 0, 0]
    expect(result[0]).toBeCloseTo(1, 2);
    expect(result[1]).toBeCloseTo(0, 2);
    expect(result[2]).toBeCloseTo(0, 2);
    expect(result[3]).toBeCloseTo(0, 2);
  });

  it("converts complex Euler angles", () => {
    const eulerAngles: [number, number, number] = [45, 30, 60];
    const result = eulerToQuaternion(eulerAngles);

    // Verify it's a valid quaternion (magnitude should be 1)
    const magnitude = Math.sqrt(
      result[0] * result[0] +
        result[1] * result[1] +
        result[2] * result[2] +
        result[3] * result[3]
    );
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it("handles negative angles", () => {
    const eulerAngles: [number, number, number] = [-90, -45, -30];
    const result = eulerToQuaternion(eulerAngles);

    // Verify it's a valid quaternion
    const magnitude = Math.sqrt(
      result[0] * result[0] +
        result[1] * result[1] +
        result[2] * result[2] +
        result[3] * result[3]
    );
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it("uses custom rotation order", () => {
    const eulerAngles: [number, number, number] = [45, 30, 60];
    const resultXYZ = eulerToQuaternion(eulerAngles, "XYZ");
    const resultZYX = eulerToQuaternion(eulerAngles, "ZYX");

    // Different rotation orders should produce different quaternions
    expect(resultXYZ).not.toEqual(resultZYX);
  });
});

describe("quaternionToEuler", () => {
  it("converts identity quaternion to zero angles", () => {
    const quaternion: [number, number, number, number] = [0, 0, 0, 1];
    const result = quaternionToEuler(quaternion);

    expect(result[0]).toBeCloseTo(0, 2);
    expect(result[1]).toBeCloseTo(0, 2);
    expect(result[2]).toBeCloseTo(0, 2);
  });

  it("converts 90 degree X rotation quaternion", () => {
    const quaternion: [number, number, number, number] = [0.707, 0, 0, 0.707];
    const result = quaternionToEuler(quaternion);

    expect(result[0]).toBeCloseTo(90, 1);
    expect(result[1]).toBeCloseTo(0, 1);
    expect(result[2]).toBeCloseTo(0, 1);
  });

  it("converts 90 degree Y rotation quaternion", () => {
    // Use more precise quaternion values for 90 degree Y rotation
    const quaternion: [number, number, number, number] = [
      0, 0.7071067811865475, 0, 0.7071067811865475,
    ];
    const result = quaternionToEuler(quaternion);

    expect(result[0]).toBeCloseTo(0, 1);
    expect(result[1]).toBeCloseTo(90, 1);
    expect(result[2]).toBeCloseTo(0, 1);
  });

  it("converts 90 degree Z rotation quaternion", () => {
    const quaternion: [number, number, number, number] = [0, 0, 0.707, 0.707];
    const result = quaternionToEuler(quaternion);

    expect(result[0]).toBeCloseTo(0, 1);
    expect(result[1]).toBeCloseTo(0, 1);
    expect(result[2]).toBeCloseTo(90, 1);
  });

  it("converts 180 degree X rotation quaternion", () => {
    const quaternion: [number, number, number, number] = [1, 0, 0, 0];
    const result = quaternionToEuler(quaternion);

    // Accept both 180 and -180 as they represent the same rotation
    expect(Math.abs(result[0])).toBeCloseTo(180, 1);
    expect(result[1]).toBeCloseTo(0, 1);
    expect(result[2]).toBeCloseTo(0, 1);
  });

  it("handles complex quaternions", () => {
    const quaternion: [number, number, number, number] = [0.5, 0.3, 0.2, 0.8];
    const result = quaternionToEuler(quaternion);

    // Verify the result is reasonable (angles should be in degrees)
    expect(result[0]).toBeGreaterThanOrEqual(-180);
    expect(result[0]).toBeLessThanOrEqual(180);
    expect(result[1]).toBeGreaterThanOrEqual(-180);
    expect(result[1]).toBeLessThanOrEqual(180);
    expect(result[2]).toBeGreaterThanOrEqual(-180);
    expect(result[2]).toBeLessThanOrEqual(180);
  });

  it("uses custom rotation order", () => {
    const quaternion: [number, number, number, number] = [0.707, 0, 0, 0.707];
    const resultXYZ = quaternionToEuler(quaternion, "XYZ");
    const resultZYX = quaternionToEuler(quaternion, "ZYX");

    // Different rotation orders should produce different Euler angles
    expect(resultXYZ).not.toEqual(resultZYX);
  });
});

describe("eulerToQuaternion and quaternionToEuler roundtrip", () => {
  it("maintains consistency for simple rotations", () => {
    const originalEuler: [number, number, number] = [45, 30, 60];
    const quaternion = eulerToQuaternion(originalEuler);
    const convertedEuler = quaternionToEuler(quaternion);

    // The converted Euler should be equivalent to the original
    // (allowing for different representations of the same rotation)
    expect(convertedEuler[0]).toBeCloseTo(originalEuler[0], 1);
    expect(convertedEuler[1]).toBeCloseTo(originalEuler[1], 1);
    expect(convertedEuler[2]).toBeCloseTo(originalEuler[2], 1);
  });

  it("maintains consistency for zero rotation", () => {
    const originalEuler: [number, number, number] = [0, 0, 0];
    const quaternion = eulerToQuaternion(originalEuler);
    const convertedEuler = quaternionToEuler(quaternion);

    expect(convertedEuler[0]).toBeCloseTo(0, 2);
    expect(convertedEuler[1]).toBeCloseTo(0, 2);
    expect(convertedEuler[2]).toBeCloseTo(0, 2);
  });

  it("maintains consistency for 90 degree rotations", () => {
    const testCases: [number, number, number][] = [
      [90, 0, 0],
      [0, 90, 0],
      [0, 0, 90],
    ];

    testCases.forEach((originalEuler) => {
      const quaternion = eulerToQuaternion(originalEuler);
      const convertedEuler = quaternionToEuler(quaternion);

      // Allow for some tolerance due to floating point precision
      expect(convertedEuler[0]).toBeCloseTo(originalEuler[0], 1);
      expect(convertedEuler[1]).toBeCloseTo(originalEuler[1], 1);
      expect(convertedEuler[2]).toBeCloseTo(originalEuler[2], 1);
    });
  });

  it("maintains quaternion magnitude during conversion", () => {
    const testEuler: [number, number, number] = [45, 30, 60];
    const quaternion = eulerToQuaternion(testEuler);

    // Verify the quaternion is normalized
    const magnitude = Math.sqrt(
      quaternion[0] * quaternion[0] +
        quaternion[1] * quaternion[1] +
        quaternion[2] * quaternion[2] +
        quaternion[3] * quaternion[3]
    );
    expect(magnitude).toBeCloseTo(1, 5);
  });
});
