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

describe("PlanarCamera.isLassoStart", () => {
  // jsdom has no PointerEvent constructor; the method reads two fields
  const down = (init: { button?: number; shiftKey?: boolean }) =>
    ({ button: 0, shiftKey: false, ...init }) as PointerEvent;

  it("gives plain drags to the lasso in select mode only", () => {
    const element = document.createElement("div");
    const camera = new PlanarCamera(element, vi.fn());

    // Default mode is select: plain drag lassos, shift-drag pans
    expect(camera.isLassoStart(down({}))).toBe(true);
    expect(camera.isLassoStart(down({ shiftKey: true }))).toBe(false);

    camera.setMode("explore");
    expect(camera.isLassoStart(down({}))).toBe(false);

    camera.setMode("select");
    expect(camera.isLassoStart(down({}))).toBe(true);

    camera.destroy();
  });
});

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

describe("PlanarCamera focus", () => {
  const center = (camera: PlanarCamera["camera"]) => [
    (camera.left + camera.right) / 2,
    (camera.bottom + camera.top) / 2,
  ];

  // Legend/filter hides move the interesting region; reset must follow
  // it — and forget it again when everything is visible or data changes
  it("reset frames the focus, and setBounds clears it", () => {
    const element = document.createElement("div");
    const camera = new PlanarCamera(element, vi.fn());
    camera.setBounds(BOUNDS, 100, 100);
    const homeWidth = camera.camera.right - camera.camera.left;

    camera.setFocus({ xMin: 7, xMax: 9, yMin: 1, yMax: 3, zMin: 0, zMax: 0 });
    // No immediate movement — focus only steers the next reset
    expect(center(camera.camera)).toEqual([5, 5]);

    camera.reset();
    const [cx, cy] = center(camera.camera);
    expect(cx).toBeCloseTo(8);
    expect(cy).toBeCloseTo(2);
    expect(camera.camera.right - camera.camera.left).toBeLessThan(homeWidth);

    camera.setFocus(null);
    camera.reset();
    expect(center(camera.camera)).toEqual([5, 5]);

    camera.setFocus({ xMin: 7, xMax: 9, yMin: 1, yMax: 3, zMin: 0, zMax: 0 });
    camera.setBounds(BOUNDS, 100, 100);
    camera.reset();
    expect(center(camera.camera)).toEqual([5, 5]);

    camera.destroy();
  });
});
