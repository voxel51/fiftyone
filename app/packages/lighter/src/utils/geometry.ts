/**
 * Copyright 2017-2025, Voxel51, Inc.
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
  const [px, py] = [point.x, point.y];
  const [ax, ay] = [segmentStart.x, segmentStart.y];
  const [bx, by] = [segmentEnd.x, segmentEnd.y];

  const segmentLength = distance(ax, ay, bx, by);
  const [projX, projY] = project2d(px, py, ax, ay, bx, by);

  if (
    distance(ax, ay, projX, projY) < segmentLength &&
    distance(bx, by, projX, projY) < segmentLength
  ) {
    // The projected point is between the two endpoints, so it is on the segment
    // - return the distance from the projected point.
    return distance(px, py, projX, projY);
  } else {
    // The projected point lies outside the segment, so return the distance from
    // the closest endpoint.
    return Math.min(distance(px, py, ax, ay), distance(px, py, bx, by));
  }
}
