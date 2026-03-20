/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Point } from "../types";

/**
 * Calculates the Euclidean distance between two points.
 */
export function distance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
}

/**
 * Calculates the dot product of two 2D vectors.
 */
export function dot2d(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

/**
 * Projects a point onto a line defined by two other points.
 */
export function project2d(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): [number, number] {
  // line vector - this is relative to (0, 0), so coordinates of p need to be
  // transformed accordingly
  const vx = bx - ax;
  const vy = by - ay;

  // Handle zero-length line segment
  if (vx === 0 && vy === 0) {
    return [ax, ay];
  }

  const projMagnitude = dot2d(px - ax, py - ay, vx, vy) / dot2d(vx, vy, vx, vy);
  const projX = projMagnitude * vx + ax;
  const projY = projMagnitude * vy + ay;
  return [projX, projY];
}

/**
 * Calculates the distance from a point to a line segment defined by two other points.
 */
export function distanceFromLineSegment(
  point: Point,
  segmentStart: Point,
  segmentEnd: Point
): number {
  const px = point.x,
    py = point.y;
  const ax = segmentStart.x,
    ay = segmentStart.y;
  const bx = segmentEnd.x,
    by = segmentEnd.y;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // Zero-length segment — distance to the single point
    return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
  }

  // Parameter t of the projection onto the infinite line through a→b.
  // t ∈ [0,1] means the closest point is on the segment; uses only a dot
  // product (no sqrt) to determine which branch to take.
  const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;

  let closestX: number, closestY: number;
  if (t <= 0) {
    closestX = ax;
    closestY = ay;
  } else if (t >= 1) {
    closestX = bx;
    closestY = by;
  } else {
    closestX = ax + t * dx;
    closestY = ay + t * dy;
  }

  return Math.sqrt(
    (px - closestX) * (px - closestX) + (py - closestY) * (py - closestY)
  );
}

/**
 * Tests whether a point lies inside a polygon using the ray-casting algorithm.
 * The polygon is defined by an ordered list of vertices; the last vertex is
 * implicitly connected back to the first.
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;

  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;

    if (
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}
