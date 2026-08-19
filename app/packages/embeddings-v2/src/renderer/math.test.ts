import { describe, expect, it } from "vitest";
import { buildColumns } from "./columns";
import {
  clampToHome,
  fitRect,
  nearestPoint,
  panRect,
  pointInPolygon,
  pxToData,
  selectInPolygon,
  worldRect,
  zoomOf,
  zoomRect,
  type Rect,
} from "./math";
import type { EmbeddingPoint, Polygon } from "./types";

// Identity view-projection: data is already in NDC, so a point (x, y)
// projects to ((x/2 + 0.5) * width, (0.5 - y/2) * height). Column-major
// like three.js Matrix4.elements.
// prettier-ignore
const IDENTITY = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

// w = -z: points with z >= 0 land at or behind the camera (w <= 0)
// prettier-ignore
const NEGATIVE_W = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, -1,
  0, 0, 0, 0,
];

const cols = (points: Array<[number, number, number?]>) =>
  buildColumns(
    points.map(
      ([x, y, z], i): EmbeddingPoint => ({ id: `${i}`, x, y, z, label: null }),
    ),
  );

describe("fitRect", () => {
  it("insets the data extent by the margin in px", () => {
    // 100x100 viewport, 10px margin: 80 usable px span the data
    const rect = fitRect({ xMin: 0, xMax: 8, yMin: 0, yMax: 8 }, 100, 100, 10);
    expect(rect.x0).toBeCloseTo(-1);
    expect(rect.x1).toBeCloseTo(9);
    expect(rect.y0).toBeCloseTo(-1);
    expect(rect.y1).toBeCloseTo(9);
  });

  it("keeps one data-per-px scale in a wide viewport (contain-fit)", () => {
    const rect = fitRect({ xMin: 0, xMax: 8, yMin: 0, yMax: 8 }, 200, 100, 10);
    // Height is the tight axis: 80 usable px -> 0.1 data/px everywhere
    expect((rect.y1 - rect.y0) / 100).toBeCloseTo(0.1);
    expect((rect.x1 - rect.x0) / 200).toBeCloseTo(0.1);
    // The slack axis centers the data
    expect(rect.x0).toBeCloseTo(-6);
    expect(rect.x1).toBeCloseTo(14);
    expect(rect.y0).toBeCloseTo(-1);
    expect(rect.y1).toBeCloseTo(9);
  });

  it("keeps wide data fully in view in a tall viewport", () => {
    const bounds = { xMin: 0, xMax: 16, yMin: 0, yMax: 4 };
    const rect = fitRect(bounds, 100, 200, 10);
    // Width is the tight axis: 80 usable px -> 0.2 data/px
    const perPx = (rect.x1 - rect.x0) / 100;
    expect(perPx).toBeCloseTo(0.2);
    expect((rect.y1 - rect.y0) / 200).toBeCloseTo(perPx);
    // The whole extent sits inside the rect with at least the margin
    expect((bounds.xMin - rect.x0) / perPx).toBeCloseTo(10);
    expect((rect.y1 - bounds.yMax) / perPx).toBeGreaterThanOrEqual(10);
  });

  it("gives degenerate extents a nonzero span, margin or not", () => {
    for (const margin of [0, 10]) {
      const rect = fitRect(
        { xMin: 5, xMax: 5, yMin: 5, yMax: 5 },
        100,
        100,
        margin,
      );
      expect(rect.x1 - rect.x0).toBeGreaterThan(0);
      expect(rect.y1 - rect.y0).toBeGreaterThan(0);
      // Centered on the point
      expect((rect.x0 + rect.x1) / 2).toBeCloseTo(5);
      expect((rect.y0 + rect.y1) / 2).toBeCloseTo(5);
    }
  });
});

describe("pxToData", () => {
  const rect: Rect = { x0: 0, y0: 0, x1: 10, y1: 10 };

  it("maps corners with the y flip", () => {
    // Screen top-left is data (x0, y1): screen y points down
    expect(pxToData(rect, 100, 100, 0, 0)).toEqual([0, 10]);
    expect(pxToData(rect, 100, 100, 100, 100)).toEqual([10, 0]);
    expect(pxToData(rect, 100, 100, 50, 50)).toEqual([5, 5]);
  });
});

describe("zoomRect / panRect / clampToHome", () => {
  const home: Rect = { x0: 0, y0: 0, x1: 10, y1: 10 };

  it("keeps the focus point stationary while zooming", () => {
    const zoomed = zoomRect(home, home, [2, 2], 2, 50);
    // Focus sat at 20% of the span; it must still sit at 20%
    expect((2 - zoomed.x0) / (zoomed.x1 - zoomed.x0)).toBeCloseTo(0.2);
    expect(zoomOf(zoomed, home)).toBeCloseTo(2);
  });

  it("never zooms out past home", () => {
    const rect = zoomRect(home, home, [5, 5], 0.5, 50);
    expect(rect).toEqual(home);
  });

  it("clamps zoom-in at maxZoom", () => {
    let rect = home;
    for (let i = 0; i < 10; i++) rect = zoomRect(rect, home, [5, 5], 4, 8);
    expect(zoomOf(rect, home)).toBeCloseTo(8);
  });

  it("clamps pans to home's edges", () => {
    const rect: Rect = { x0: 2, y0: 2, x1: 4, y1: 4 };
    expect(panRect(rect, home, -5, 0)).toEqual({ x0: 0, y0: 2, x1: 2, y1: 4 });
    expect(panRect(rect, home, 0, 100)).toEqual({
      x0: 2,
      y0: 8,
      x1: 4,
      y1: 10,
    });
  });

  it("slides an out-of-bounds rect back inside home", () => {
    expect(clampToHome({ x0: -1, y0: 3, x1: 1, y1: 5 }, home)).toEqual({
      x0: 0,
      y0: 3,
      x1: 2,
      y1: 5,
    });
  });

  it("builds the world by scaling home about its center", () => {
    expect(worldRect(home, 0.5)).toEqual({ x0: -5, y0: -5, x1: 15, y1: 15 });
    expect(worldRect(home, 1)).toEqual(home);
  });

  // The world model's headline: the fit view is smaller than the
  // world, so panning works at the default view — up to the world edge
  it("pans the fit view within the world", () => {
    const world = worldRect(home, 0.5);
    expect(panRect(home, world, 3, 0)).toEqual({
      x0: 3,
      y0: 0,
      x1: 13,
      y1: 10,
    });
    expect(panRect(home, world, 100, 0)).toEqual({
      x0: 5,
      y0: 0,
      x1: 15,
      y1: 10,
    });
  });

  it("zooms out past fit to the world, never beyond", () => {
    const world = worldRect(home, 0.5);
    expect(zoomRect(home, home, [5, 5], 0.1, 50, world)).toEqual(world);
  });

  // Regression: bounds must not move during a zoom — clamping against
  // home instead of the world yanked a panned view back toward center
  it("zooming in from a panned fit view stays put", () => {
    const world = worldRect(home, 0.5);
    const panned = panRect(home, world, 3, 0);
    const zoomed = zoomRect(panned, home, [8, 5], 2, 50, world);
    expect((zoomed.x0 + zoomed.x1) / 2).toBeCloseTo(8);
    expect((8 - zoomed.x0) / (zoomed.x1 - zoomed.x0)).toBeCloseTo(0.5);
    expect(zoomOf(zoomed, home)).toBeCloseTo(2);
  });
});

describe("pointInPolygon", () => {
  const square: Polygon = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  it("detects inside and outside for a square", () => {
    expect(pointInPolygon(square, 5, 5)).toBe(true);
    expect(pointInPolygon(square, 15, 5)).toBe(false);
    expect(pointInPolygon(square, -1, -1)).toBe(false);
  });

  it("handles concave polygons", () => {
    // A "C" shape: the notch on the right is outside
    const c: Polygon = [
      [0, 0],
      [10, 0],
      [10, 3],
      [3, 3],
      [3, 7],
      [10, 7],
      [10, 10],
      [0, 10],
    ];
    expect(pointInPolygon(c, 1, 5)).toBe(true);
    expect(pointInPolygon(c, 8, 5)).toBe(false);
  });
});

describe("selectInPolygon", () => {
  // Points in NDC; with IDENTITY on a 100x100 viewport, (0,0) is screen
  // (50,50), (0.5,0.5) is (75,25), (-0.5,-0.5) is (25,75)
  const data = cols([
    [0, 0],
    [0.5, 0.5],
    [-0.5, -0.5],
  ]);
  const around = (x: number, y: number, r: number): Polygon => [
    [x - r, y - r],
    [x + r, y - r],
    [x + r, y + r],
    [x - r, y + r],
  ];

  it("selects exactly the enclosed points", () => {
    expect(
      selectInPolygon(data, IDENTITY, 100, 100, around(50, 50, 5)),
    ).toEqual([0]);
    expect(
      selectInPolygon(data, IDENTITY, 100, 100, around(50, 50, 40)),
    ).toEqual([0, 1, 2]);
  });

  it("skips points hidden by the visibility mask", () => {
    const visible = new Uint8Array([1, 0, 1]);
    expect(
      selectInPolygon(data, IDENTITY, 100, 100, around(50, 50, 40), visible),
    ).toEqual([0, 2]);
  });

  it("never selects points at or behind the camera (w <= 0)", () => {
    const behind = cols([[0, 0, 1]]);
    expect(
      selectInPolygon(behind, NEGATIVE_W, 100, 100, around(50, 50, 60)),
    ).toEqual([]);
  });
});

describe("nearestPoint", () => {
  const data = cols([
    [0, 0],
    [0.5, 0.5],
  ]);

  it("returns the nearest point within the radius", () => {
    const hit = nearestPoint(data, IDENTITY, 100, 100, 52, 52, 8);
    expect(hit?.index).toBe(0);
    expect(hit?.x).toBeCloseTo(50);
    expect(hit?.y).toBeCloseTo(50);
  });

  it("returns null when nothing is within the radius", () => {
    expect(nearestPoint(data, IDENTITY, 100, 100, 10, 90, 8)).toBeNull();
  });

  it("prefers the closer of two candidates", () => {
    // (62, 38) sits between screen points (50,50) and (75,25), nearer #1
    const hit = nearestPoint(data, IDENTITY, 100, 100, 65, 35, 50);
    expect(hit?.index).toBe(1);
  });

  it("skips points hidden by the visibility mask", () => {
    const visible = new Uint8Array([0, 1]);
    const hit = nearestPoint(data, IDENTITY, 100, 100, 52, 52, 50, visible);
    expect(hit?.index).toBe(1);
  });

  it("skips points at or behind the camera (w <= 0)", () => {
    const behind = cols([[0, 0, 1]]);
    expect(nearestPoint(behind, NEGATIVE_W, 100, 100, 50, 50, 100)).toBeNull();
  });
});
