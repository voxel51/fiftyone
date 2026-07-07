// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { PlanarCamera } from "./PlanarCamera";

const BOUNDS = {
  xMin: 0,
  xMax: 10,
  yMin: 0,
  yMax: 10,
  zMin: 0,
  zMax: 0,
};

describe("PlanarCamera.toDataPolygon", () => {
  it("maps screen vertices into the data window", () => {
    const element = document.createElement("div");
    const camera = new PlanarCamera(element, vi.fn());
    camera.setBounds(BOUNDS, 100, 100);

    // The viewport center is the data center regardless of margin
    const [center] = camera.toDataPolygon([[50, 50]]);
    expect(center[0]).toBeCloseTo(5);
    expect(center[1]).toBeCloseTo(5);

    // Screen y points down: below-center maps to smaller data y
    const [below] = camera.toDataPolygon([[50, 75]]);
    expect(below[1]).toBeLessThan(5);

    camera.destroy();
  });
});
