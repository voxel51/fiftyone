import { describe, expect, it } from "vitest";
import { Vec3, projectTo2D, rotatePoint } from "./label-3d-projection-utils";

describe("rotatePoint", () => {
  it("should correctly rotate a point around the origin - y axis", () => {
    const point: Vec3 = [1, 0, 0];
    const rotation: Vec3 = [0, Math.PI / 2, 0];
    const rotatedPoint = rotatePoint(point, rotation);
    expect(rotatedPoint[0]).toBeCloseTo(0);
    expect(rotatedPoint[1]).toBeCloseTo(0);
    expect(rotatedPoint[2]).toBeCloseTo(-1);
  });

  it("should correctly rotate a point around the origin - x axis", () => {
    const point: Vec3 = [1, 0, 0];
    const rotation: Vec3 = [Math.PI / 2, 0, 0];
    const rotatedPoint = rotatePoint(point, rotation);
    expect(rotatedPoint[0]).toBeCloseTo(1);
    expect(rotatedPoint[1]).toBeCloseTo(0);
    expect(rotatedPoint[2]).toBeCloseTo(0);
  });

  it("should correctly rotate a point around the origin - z axis", () => {
    const point: Vec3 = [1, 0, 0];
    const rotation: Vec3 = [0, 0, Math.PI / 2];
    const rotatedPoint = rotatePoint(point, rotation);
    expect(rotatedPoint[0]).toBeCloseTo(0);
    expect(rotatedPoint[1]).toBeCloseTo(1);
    expect(rotatedPoint[2]).toBeCloseTo(0);
  });

  it("should correctly rotate a point around the origin - z axis (2)", () => {
    const point: Vec3 = [1, 0, 0];
    const rotation: Vec3 = [0, 0, Math.PI];
    const rotatedPoint = rotatePoint(point, rotation);
    expect(rotatedPoint[0]).toBeCloseTo(-1);
    expect(rotatedPoint[1]).toBeCloseTo(0);
    expect(rotatedPoint[2]).toBeCloseTo(0);
  });

  it("should correctly rotate a point around the origin - xyz axis", () => {
    const point: Vec3 = [1, 0, 0];
    const rotation: Vec3 = [0, Math.PI / 4, Math.PI / 2];
    const rotatedPoint = rotatePoint(point, rotation);
    expect(rotatedPoint[0]).toBeCloseTo(0);
    expect(rotatedPoint[1]).toBeCloseTo(Math.sqrt(2) / 2);
    expect(rotatedPoint[2]).toBeCloseTo(-Math.sqrt(2) / 2);
  });

  it("should handle no rotation", () => {
    const point: Vec3 = [1, 2, 3];
    const rotation: Vec3 = [0, 0, 0];
    const rotatedPoint = rotatePoint(point, rotation);
    expect(rotatedPoint).toEqual([1, 2, 3]);
  });
});

describe("projectTo2D", () => {
  it("should project a point to the xz plane", () => {
    const point: Vec3 = [1, 2, 3];
    const projectedPoint = projectTo2D(point, "xz");
    expect(projectedPoint).toEqual([1, 3]);
  });

  it("should project a point to the xy plane", () => {
    const point: Vec3 = [1, 2, 3];
    const projectedPoint = projectTo2D(point, "xy");
    expect(projectedPoint).toEqual([1, 2]);
  });

  it("should project a point to the yz plane", () => {
    const point: Vec3 = [1, 2, 3];
    const projectedPoint = projectTo2D(point, "yz");
    expect(projectedPoint).toEqual([2, 3]);
  });
});
