// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ZOOM, MARGIN } from "../constants";
import { fitRect } from "../math";
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

describe("PlanarCamera default view", () => {
  // Load and reset land at DEFAULT_ZOOM, not fit: the cloud gets
  // breathing room around it and pan works immediately
  it("starts slightly zoomed out of fit", () => {
    const element = document.createElement("div");
    const camera = new PlanarCamera(element, vi.fn());
    camera.setBounds(BOUNDS, 100, 100);

    const home = fitRect(BOUNDS, 100, 100, MARGIN);
    expect(camera.camera.right - camera.camera.left).toBeCloseTo(
      (home.x1 - home.x0) / DEFAULT_ZOOM,
    );

    camera.destroy();
  });
});

describe("PlanarCamera pan", () => {
  // The world model's headline: panning works at the default view
  // (the window is smaller than the world), and reset recovers
  it("pans at the default view, and reset recenters", () => {
    const element = document.createElement("div");
    // jsdom has no pointer capture; the pan handlers call it
    element.setPointerCapture = vi.fn();
    const camera = new PlanarCamera(element, vi.fn());
    camera.setBounds(BOUNDS, 100, 100);
    camera.setMode("explore");

    const pointer = (type: string, init: Record<string, unknown>) =>
      element.dispatchEvent(Object.assign(new Event(type), init));

    pointer("pointerdown", {
      pointerId: 1,
      button: 0,
      offsetX: 80,
      offsetY: 50,
    });
    pointer("pointermove", { pointerId: 1, offsetX: 40, offsetY: 50 });
    pointer("pointerup", { pointerId: 1 });

    const panned = (camera.camera.left + camera.camera.right) / 2;
    expect(panned).toBeGreaterThan(5);

    camera.reset();
    expect((camera.camera.left + camera.camera.right) / 2).toBeCloseTo(5);

    camera.destroy();
  });
});

describe("PlanarCamera focus", () => {
  const center = (camera: PlanarCamera["camera"]) => [
    (camera.left + camera.right) / 2,
    (camera.bottom + camera.top) / 2,
  ];

  const expectCentered = (camera: PlanarCamera["camera"]) => {
    const [cx, cy] = center(camera);
    expect(cx).toBeCloseTo(5);
    expect(cy).toBeCloseTo(5);
  };

  // Legend/filter hides move the interesting region; reset must follow
  // it — and forget it again when everything is visible or data changes
  it("reset frames the focus, and setBounds clears it", () => {
    const element = document.createElement("div");
    const camera = new PlanarCamera(element, vi.fn());
    camera.setBounds(BOUNDS, 100, 100);
    const defaultWidth = camera.camera.right - camera.camera.left;

    camera.setFocus({ xMin: 7, xMax: 9, yMin: 1, yMax: 3, zMin: 0, zMax: 0 });
    // No immediate movement — focus only steers the next reset
    expectCentered(camera.camera);

    camera.reset();
    const [cx, cy] = center(camera.camera);
    expect(cx).toBeCloseTo(8);
    expect(cy).toBeCloseTo(2);
    expect(camera.camera.right - camera.camera.left).toBeLessThan(defaultWidth);

    camera.setFocus(null);
    camera.reset();
    expectCentered(camera.camera);
    // Back to the DEFAULT view, not the fit view — center alone can't
    // tell those apart
    expect(camera.camera.right - camera.camera.left).toBeCloseTo(defaultWidth);

    camera.setFocus({ xMin: 7, xMax: 9, yMin: 1, yMax: 3, zMin: 0, zMax: 0 });
    camera.setBounds(BOUNDS, 100, 100);
    camera.reset();
    expectCentered(camera.camera);

    camera.destroy();
  });
});

describe("PlanarCamera cursor", () => {
  // A drag shows the closed hand, then gives back the resting cursor,
  // which the chart owns (crosshair in select, grab in explore)
  it("borrows the cursor for the duration of a drag", () => {
    const element = document.createElement("div");
    // jsdom has no pointer capture; the pan handlers call it
    element.setPointerCapture = vi.fn();
    const camera = new PlanarCamera(element, vi.fn());
    camera.setBounds(BOUNDS, 100, 100);
    camera.setMode("explore");
    element.style.cursor = "grab";

    const pointer = (type: string, init: Record<string, unknown>) =>
      element.dispatchEvent(Object.assign(new Event(type), init));

    pointer("pointerdown", {
      pointerId: 1,
      button: 0,
      offsetX: 50,
      offsetY: 50,
    });
    expect(element.style.cursor).toBe("grabbing");

    pointer("pointermove", { pointerId: 1, offsetX: 60, offsetY: 50 });
    expect(element.style.cursor).toBe("grabbing");

    pointer("pointerup", { pointerId: 1 });
    expect(element.style.cursor).toBe("grab");

    camera.destroy();
  });
});
