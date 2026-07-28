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
  y2: number,
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
  by: number,
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
 * Projects a point onto a line segment, clamping the result to the segment's
 * endpoints when the perpendicular projection would fall outside.
 *
 * Differs from {@link project2d} (which projects onto the *infinite* line
 * through the two endpoints) by clamping to the segment itself, so the
 * returned point always lies on or between `segmentStart` and `segmentEnd`.
 *
 * @param point The point to project, as `[x, y]`.
 * @param segmentStart Segment start endpoint, as `[x, y]`.
 * @param segmentEnd Segment end endpoint, as `[x, y]`.
 * @returns The closest point on the segment to `point`, as `[x, y]`. When the
 *   segment is zero-length, returns a copy of `segmentStart`.
 */
export function projectOntoSegment2d(
  point: [number, number],
  segmentStart: [number, number],
  segmentEnd: [number, number],
): [number, number] {
  const dx = segmentEnd[0] - segmentStart[0];
  const dy = segmentEnd[1] - segmentStart[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return [segmentStart[0], segmentStart[1]];
  }

  // fraction along the segment, clamped to [0, 1]
  const fraction = Math.min(
    Math.max(
      ((point[0] - segmentStart[0]) * dx + (point[1] - segmentStart[1]) * dy) /
        lenSq,
      0,
    ),
    1,
  );

  return [segmentStart[0] + fraction * dx, segmentStart[1] + fraction * dy];
}

/**
 * Calculates the distance from a point to a line segment defined by two other points.
 */
export function distanceFromLineSegment(
  point: Point,
  segmentStart: Point,
  segmentEnd: Point,
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
    (px - closestX) * (px - closestX) + (py - closestY) * (py - closestY),
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
