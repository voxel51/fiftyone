/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { expect, test, describe } from "vitest";
import {
  distance,
  dot2d,
  project2d,
  distanceFromLineSegment,
} from "./geometry";
import type { Point } from "../types";

describe("geometry", () => {
  describe("distance", () => {
    test("should calculate distance between two points", () => {
      expect(distance(0, 0, 3, 4)).toBe(5);
      expect(distance(1, 1, 4, 5)).toBe(5);
      expect(distance(-1, -1, 2, 3)).toBe(5);
    });

    test("should return 0 for same point", () => {
      expect(distance(5, 5, 5, 5)).toBe(0);
      expect(distance(0, 0, 0, 0)).toBe(0);
      expect(distance(-3, 7, -3, 7)).toBe(0);
    });

    test("should handle decimal coordinates", () => {
      expect(distance(0.5, 0.5, 2.5, 2.5)).toBeCloseTo(2.828, 3);
    });
  });

  describe("dot2d", () => {
    test("should calculate dot product of two 2D vectors", () => {
      expect(dot2d(1, 2, 3, 4)).toBe(11); // 1*3 + 2*4 = 3 + 8 = 11
      expect(dot2d(0, 0, 5, 6)).toBe(0); // 0*5 + 0*6 = 0
      expect(dot2d(2, 3, 0, 0)).toBe(0); // 2*0 + 3*0 = 0
    });

    test("should handle negative values", () => {
      expect(dot2d(-1, -2, 3, 4)).toBe(-11); // -1*3 + -2*4 = -3 + -8 = -11
      expect(dot2d(1, 2, -3, -4)).toBe(-11); // 1*-3 + 2*-4 = -3 + -8 = -11
      expect(dot2d(-1, -2, -3, -4)).toBe(11); // -1*-3 + -2*-4 = 3 + 8 = 11
    });

    test("should handle decimal values", () => {
      expect(dot2d(0.5, 1.5, 2.0, 3.0)).toBe(5.5); // 0.5*2 + 1.5*3 = 1 + 4.5 = 5.5
      expect(dot2d(1.1, 2.2, 3.3, 4.4)).toBeCloseTo(13.31, 2); // 1.1*3.3 + 2.2*4.4
    });

    test("should handle zero vectors", () => {
      expect(dot2d(0, 0, 0, 0)).toBe(0);
      expect(dot2d(1, 1, 0, 0)).toBe(0);
      expect(dot2d(0, 0, 1, 1)).toBe(0);
    });
  });

  describe("project2d", () => {
    test("should project point onto horizontal line", () => {
      const [projX, projY] = project2d(5, 3, 0, 0, 10, 0);
      expect(projX).toBe(5);
      expect(projY).toBe(0);
    });

    test("should project point onto vertical line", () => {
      const [projX, projY] = project2d(3, 5, 0, 0, 0, 10);
      expect(projX).toBe(0);
      expect(projY).toBe(5);
    });

    test("should project point onto diagonal line", () => {
      const [projX, projY] = project2d(2, 2, 0, 0, 4, 4);
      expect(projX).toBe(2);
      expect(projY).toBe(2);
    });

    test("should project point that is already on the line", () => {
      const [projX, projY] = project2d(2, 2, 0, 0, 4, 4);
      expect(projX).toBe(2);
      expect(projY).toBe(2);
    });

    test("should project point onto line with negative coordinates", () => {
      const [projX, projY] = project2d(0, 0, -2, -2, 2, 2);
      expect(projX).toBe(0);
      expect(projY).toBe(0);
    });

    test("should handle decimal coordinates", () => {
      const [projX, projY] = project2d(1.5, 2.5, 0, 0, 3, 3);
      expect(projX).toBeCloseTo(2, 1);
      expect(projY).toBeCloseTo(2, 1);
    });

    test("should handle zero-length line segment", () => {
      const [projX, projY] = project2d(5, 3, 2, 2, 2, 2);
      expect(projX).toBe(2);
      expect(projY).toBe(2);
    });
  });

  describe("distanceFromLineSegment", () => {
    test("should calculate distance to horizontal line segment", () => {
      const point: Point = { x: 5, y: 3 };
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 10, y: 0 };

      expect(distanceFromLineSegment(point, start, end)).toBe(3);
    });

    test("should calculate distance to vertical line segment", () => {
      const point: Point = { x: 3, y: 5 };
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 0, y: 10 };

      expect(distanceFromLineSegment(point, start, end)).toBe(3);
    });

    test("should calculate distance to diagonal line segment", () => {
      const point: Point = { x: 0, y: 0 };
      const start: Point = { x: 1, y: 1 };
      const end: Point = { x: 3, y: 3 };

      expect(distanceFromLineSegment(point, start, end)).toBeCloseTo(1.414, 3);
    });

    test("should return distance to closest endpoint when projection is outside segment", () => {
      const point: Point = { x: 5, y: 0 };
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 2, y: 0 };

      // Projection would be at (5, 0) which is outside the segment [0,0] to [2,0]
      // So it should return distance to closest endpoint (2, 0) which is 3
      expect(distanceFromLineSegment(point, start, end)).toBe(3);
    });

    test("should return distance to start point when projection is outside segment", () => {
      const point: Point = { x: -1, y: 0 };
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 2, y: 0 };

      // Projection would be at (-1, 0) which is outside the segment [0,0] to [2,0]
      // So it should return distance to closest endpoint (0, 0) which is 1
      expect(distanceFromLineSegment(point, start, end)).toBe(1);
    });

    test("should handle point exactly on the line segment", () => {
      const point: Point = { x: 1, y: 1 };
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 2, y: 2 };

      expect(distanceFromLineSegment(point, start, end)).toBe(0);
    });

    test("should handle point at one of the endpoints", () => {
      const point: Point = { x: 0, y: 0 };
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 2, y: 2 };

      expect(distanceFromLineSegment(point, start, end)).toBe(0);
    });

    test("should handle zero-length line segment", () => {
      const point: Point = { x: 5, y: 3 };
      const start: Point = { x: 2, y: 2 };
      const end: Point = { x: 2, y: 2 };

      expect(distanceFromLineSegment(point, start, end)).toBeCloseTo(3.162, 3);
    });

    test("should handle negative coordinates", () => {
      const point: Point = { x: 0, y: 0 };
      const start: Point = { x: -2, y: -2 };
      const end: Point = { x: 2, y: 2 };

      expect(distanceFromLineSegment(point, start, end)).toBe(0);
    });

    test("should handle decimal coordinates", () => {
      const point: Point = { x: 1.5, y: 1.5 };
      const start: Point = { x: 0, y: 0 };
      const end: Point = { x: 3, y: 3 };

      expect(distanceFromLineSegment(point, start, end)).toBe(0);
    });
  });
});
