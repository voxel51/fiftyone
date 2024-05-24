import { describe, expect, it } from "vitest";
import { Vec3, projectTo2D } from "./label-3d-projection-utils";

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
