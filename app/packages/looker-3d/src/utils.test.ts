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
  getColorFromPoolBasedOnHash,
  getGridQuaternionFromUpVector,
  getPlaneFromPositionAndQuaternion,
  getPlaneIntersection,
  getQuaternionForNormal,
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
  it("returns a quaternion for up vector", () => {
    const up = new Vector3(0, 1, 0);
    const result = getGridQuaternionFromUpVector(up);
    console.log(result);
    expect(result).toBeInstanceOf(Quaternion);
    expect(result.w).toBe(1);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(0);
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

describe("getQuaternionForNormal", () => {
  it("returns identity quaternion for Z-axis normal", () => {
    const normal = new Vector3(0, 0, 1);
    const result = getQuaternionForNormal(normal);

    expect(result).toBeInstanceOf(Quaternion);
    expect(result.w).toBeCloseTo(1);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(0);
  });

  it("returns 180-degree rotation around X-axis for negative Z-axis normal", () => {
    const normal = new Vector3(0, 0, -1);
    const result = getQuaternionForNormal(normal);

    expect(result).toBeInstanceOf(Quaternion);
    expect(result.w).toBeCloseTo(0);
    expect(result.x).toBeCloseTo(1);
    expect(result.y).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(0);
  });

  it("returns correct quaternion for X-axis normal", () => {
    const normal = new Vector3(1, 0, 0);
    const result = getQuaternionForNormal(normal);

    expect(result).toBeInstanceOf(Quaternion);
    // Should rotate Z-axis to X-axis (90 degrees around Y-axis)
    expect(result.w).toBeCloseTo(Math.sqrt(2) / 2);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(Math.sqrt(2) / 2);
    expect(result.z).toBeCloseTo(0);
  });

  it("returns correct quaternion for Y-axis normal", () => {
    const normal = new Vector3(0, 1, 0);
    const result = getQuaternionForNormal(normal);

    expect(result).toBeInstanceOf(Quaternion);
    // Should rotate Z-axis to Y-axis (90 degrees around X-axis)
    // The cross product (0,0,1) × (0,1,0) = (-1,0,0), so rotation axis is (-1,0,0)
    expect(result.w).toBeCloseTo(Math.sqrt(2) / 2);
    expect(result.x).toBeCloseTo(-Math.sqrt(2) / 2);
    expect(result.y).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(0);
  });

  it("handles arbitrary normal vectors", () => {
    const normal = new Vector3(1, 1, 0).normalize();
    const result = getQuaternionForNormal(normal);

    expect(result).toBeInstanceOf(Quaternion);
    // Verify it's a valid quaternion (unit quaternion)
    const magnitude = Math.sqrt(
      result.x * result.x +
        result.y * result.y +
        result.z * result.z +
        result.w * result.w
    );
    expect(magnitude).toBeCloseTo(1);
  });

  it("handles normalized diagonal normal", () => {
    const normal = new Vector3(1, 1, 1).normalize();
    const result = getQuaternionForNormal(normal);

    expect(result).toBeInstanceOf(Quaternion);
    // Verify it's a valid quaternion
    const magnitude = Math.sqrt(
      result.x * result.x +
        result.y * result.y +
        result.z * result.z +
        result.w * result.w
    );
    expect(magnitude).toBeCloseTo(1);
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
