/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { CoordinateSystem2D } from "../core/CoordinateSystem2D";
import { MockRenderer2D } from "../renderer/MockRenderer2D";
import type { Point } from "../types";
import { NO_BOUNDS } from "./DetectionOverlay";
import { MaskKeypoints } from "./MaskKeypoints";

/**
 * Builds a MaskKeypoints whose coordinate system is identity-over-a-100x100
 * media region, so world points equal relative points * 100. Letting world
 * coordinates equal pixel coordinates keeps thresholds easy to reason about.
 */
const makeMaskKeypoints = (
  keypointThreshold = 25
): { mk: MaskKeypoints; renderer: MockRenderer2D } => {
  const renderer = new MockRenderer2D();
  const coordinateSystem = new CoordinateSystem2D();
  coordinateSystem.updateTransform({ x: 0, y: 0, width: 100, height: 100 });

  const mk = new MaskKeypoints({
    coordinateSystem,
    renderer,
    keypointThreshold,
  });

  return { mk, renderer };
};

const at = (x: number, y: number): Point => ({ x, y });

describe("MaskKeypoints", () => {
  describe("addPoint (discrete click, dragging=false)", () => {
    it("always places a point and returns its id, regardless of distance", () => {
      const { mk } = makeMaskKeypoints();

      const id1 = mk.addPoint(at(10, 10));
      const id2 = mk.addPoint(at(10, 10)); // same spot

      expect(id1).not.toBeNull();
      expect(id2).not.toBeNull();
      expect(id1).not.toBe(id2);
      expect(mk.getAbsolutePoints()).toHaveLength(2);
    });
  });

  describe("addPoint (dragging=true)", () => {
    it("always places the first dragging point (no prior lastKeypoint)", () => {
      const { mk } = makeMaskKeypoints();
      const id = mk.addPoint(at(5, 5), { dragging: true });
      expect(id).not.toBeNull();
      expect(mk.getAbsolutePoints()).toHaveLength(1);
    });

    it("skips a dragging point closer than threshold to the last keypoint", () => {
      const { mk } = makeMaskKeypoints(/* threshold */ 25);

      const first = mk.addPoint(at(0, 0), { dragging: true });
      const skipped = mk.addPoint(at(10, 10), { dragging: true }); // dist ≈ 14.14
      expect(first).not.toBeNull();
      expect(skipped).toBeNull();
      expect(mk.getAbsolutePoints()).toHaveLength(1);
    });

    it("places a dragging point at the threshold boundary", () => {
      const { mk } = makeMaskKeypoints(/* threshold */ 25);

      mk.addPoint(at(0, 0), { dragging: true });
      const placed = mk.addPoint(at(25, 0), { dragging: true }); // dist = 25
      expect(placed).not.toBeNull();
      expect(mk.getAbsolutePoints()).toHaveLength(2);
    });

    it("a discrete click between two close drag points still places", () => {
      const { mk } = makeMaskKeypoints(/* threshold */ 25);

      mk.addPoint(at(0, 0), { dragging: true });
      const close = mk.addPoint(at(5, 5)); // discrete, threshold ignored
      expect(close).not.toBeNull();
      expect(mk.getAbsolutePoints()).toHaveLength(2);
    });
  });

  describe("connections", () => {
    it("rebuilds sequential ring connections on each add", () => {
      const { mk } = makeMaskKeypoints();
      // @ts-expect-error — read-only-ish protected accessor; we need to inspect.
      const connections = () => mk.connections as number[][];

      mk.addPoint(at(0, 0));
      expect(connections()).toEqual([]);

      mk.addPoint(at(10, 0));
      expect(connections()).toEqual([[0, 1]]);

      mk.addPoint(at(10, 10));
      expect(connections()).toEqual([
        [0, 1],
        [1, 2],
      ]);
    });

    it("rebuilds connections after a removal", () => {
      const { mk } = makeMaskKeypoints();
      const a = mk.addPoint(at(0, 0));
      const b = mk.addPoint(at(10, 0));
      mk.addPoint(at(20, 0));

      // Remove the middle point
      expect(b).not.toBeNull();
      mk.removePointById(b as string);

      const points = mk.getAbsolutePoints();
      expect(points).toHaveLength(2);
      // @ts-expect-error — inspect protected connections
      expect(mk.connections).toEqual([[0, 1]]);
      // last keypoint state should follow the new tail
      // (sanity: another dragging-skip should treat the tail as anchor)
      expect(a).not.toBeNull();
    });

    it("removing the last point clears lastKeypoint so the next dragging point places", () => {
      const { mk } = makeMaskKeypoints(/* threshold */ 25);

      const only = mk.addPoint(at(50, 50), { dragging: true });
      expect(only).not.toBeNull();
      mk.removePointById(only as string);

      // No lastKeypoint anymore → next dragging point should land immediately.
      const next = mk.addPoint(at(51, 51), { dragging: true });
      expect(next).not.toBeNull();
      expect(mk.getAbsolutePoints()).toHaveLength(1);
    });
  });

  describe("bounds", () => {
    it("returns NO_BOUNDS when no points have been added", () => {
      const { mk } = makeMaskKeypoints();
      expect(mk.bounds).toEqual(NO_BOUNDS);
    });

    it("returns a tight axis-aligned bounding box over all points", () => {
      const { mk } = makeMaskKeypoints();
      mk.addPoint(at(10, 20));
      mk.addPoint(at(30, 5));
      mk.addPoint(at(25, 40));

      expect(mk.bounds).toEqual({
        x: 10,
        y: 5,
        width: 30 - 10,
        height: 40 - 5,
      });
    });

    it("returns zero-extent bounds for a single point (no padding)", () => {
      const { mk } = makeMaskKeypoints();
      mk.addPoint(at(7, 9));
      const b = mk.bounds;
      // World→relative→world round-trip can introduce 1-ULP drift; verify the
      // shape rather than exact coordinates.
      expect(b.x).toBeCloseTo(7, 10);
      expect(b.y).toBeCloseTo(9, 10);
      expect(b.width).toBe(0);
      expect(b.height).toBe(0);
    });
  });
});
