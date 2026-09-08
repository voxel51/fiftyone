import { describe, expect, it } from "vitest";
import { buildPolylinePixelData } from "./geometry";
import type { Native2dPolyline } from "./types";

const W = 200;
const H = 100;

const polyline = (
  points: [number, number][][],
  overrides: Partial<Native2dPolyline> = {},
): Native2dPolyline => ({
  _id: "poly-1",
  _cls: "Polyline",
  path: "lanes",
  points,
  ...overrides,
});

describe("buildPolylinePixelData", () => {
  it("scales normalized points by the image dimensions", () => {
    const data = buildPolylinePixelData(
      polyline([
        [
          [0, 0],
          [0.5, 1],
        ],
      ]),
      W,
      H,
    );

    expect(data.segments[0]).toEqual([
      { u: 0, v: 0, z: 0 },
      { u: 100, v: 100, z: 0 },
    ]);
  });

  it("emits one edge per consecutive pair", () => {
    const data = buildPolylinePixelData(
      polyline([
        [
          [0, 0],
          [0.5, 0],
          [1, 0],
        ],
      ]),
      W,
      H,
    );
    expect(data.edges).toHaveLength(2);
    expect(data.edges[0]).toEqual({ x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(data.edges[1]).toEqual({ x1: 100, y1: 0, x2: 200, y2: 0 });
  });

  it("adds a closing edge back to the first point when closed", () => {
    const open = buildPolylinePixelData(
      polyline([
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      ]),
      W,
      H,
    );
    const closed = buildPolylinePixelData(
      polyline(
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
        ],
        { closed: true },
      ),
      W,
      H,
    );

    expect(open.edges).toHaveLength(2);
    expect(closed.edges).toHaveLength(3);
    // The extra edge runs last -> first.
    expect(closed.edges[2]).toEqual({ x1: 200, y1: 100, x2: 0, y2: 0 });
  });

  it("does not close a segment with fewer than 3 points", () => {
    // A 2-point "closed" polyline would otherwise draw the same edge twice.
    const data = buildPolylinePixelData(
      polyline(
        [
          [
            [0, 0],
            [1, 1],
          ],
        ],
        { closed: true },
      ),
      W,
      H,
    );
    expect(data.edges).toHaveLength(1);
  });

  it("keeps multiple segments separate and does not join them", () => {
    const data = buildPolylinePixelData(
      polyline([
        [
          [0, 0],
          [0.5, 0],
        ],
        [
          [0, 1],
          [0.5, 1],
        ],
      ]),
      W,
      H,
    );

    expect(data.segments).toHaveLength(2);
    // One edge per segment, and none bridging the two.
    expect(data.edges).toHaveLength(2);
    expect(data.vertices).toHaveLength(4);
  });

  it("skips empty and non-array segments", () => {
    const data = buildPolylinePixelData(
      polyline([
        [],
        undefined as unknown as [number, number][],
        [
          [0, 0],
          [1, 1],
        ],
      ]),
      W,
      H,
    );

    expect(data.segments).toHaveLength(1);
    expect(data.edges).toHaveLength(1);
  });

  it("returns every point as a vertex for the dot markers", () => {
    const data = buildPolylinePixelData(
      polyline([
        [
          [0, 0],
          [0.5, 0.5],
          [1, 1],
        ],
      ]),
      W,
      H,
    );
    expect(data.vertices).toHaveLength(3);
    expect(data.vertices[1]).toEqual({ u: 100, v: 50, z: 0 });
  });

  it("produces no geometry for a polyline with no segments", () => {
    const data = buildPolylinePixelData(polyline([]), W, H);
    expect(data.edges).toEqual([]);
    expect(data.vertices).toEqual([]);
    expect(data.segments).toEqual([]);
  });
});
