import { BufferAttribute, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { COLOR_POOL } from "./constants";
import {
  computeMinMaxForColorBufferAttribute,
  computeMinMaxForScalarBufferAttribute,
  deg2rad,
  getColorFromPoolBasedOnHash,
  getGridQuaternionFromUpVector,
  toEulerFromDegreesArray,
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
