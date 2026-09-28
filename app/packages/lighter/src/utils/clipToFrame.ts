/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Rect } from "../types";
import { clipPolygonToRect } from "./geometry";

/**
 * Outcome of clipping an overlay to the media frame. `empty` means nothing
 * of the label remains inside the frame.
 */
export type FrameClipResult = "unchanged" | "clipped" | "empty";

type RelativePoint = [number, number];

const FRAME = { x: 0, y: 0, width: 1, height: 1 };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Intersects a relative rect with the `[0, 1]` frame. Returns the same rect
 * when it is already inside, and `null` when the intersection has no area.
 */
export const clipRectToFrame = (rect: Rect): Rect | null => {
  if (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= 1 &&
    rect.y + rect.height <= 1
  ) {
    return rect;
  }

  const x0 = clamp01(rect.x);
  const y0 = clamp01(rect.y);
  const x1 = clamp01(rect.x + rect.width);
  const y1 = clamp01(rect.y + rect.height);

  if (x1 <= x0 || y1 <= y0) {
    return null;
  }

  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};

/**
 * Clamps a relative point into the `[0, 1]` frame. Missing (NaN) points are
 * returned untouched.
 */
export const clampPointToFrame = (point: RelativePoint): RelativePoint => [
  Number.isNaN(point[0]) ? point[0] : clamp01(point[0]),
  Number.isNaN(point[1]) ? point[1] : clamp01(point[1]),
];

const isInside = ([x, y]: RelativePoint) =>
  x >= 0 && x <= 1 && y >= 0 && y <= 1;

/**
 * Liang–Barsky: the portion of segment `a → b` inside the frame, or `null`.
 */
const clipSegment = (
  a: RelativePoint,
  b: RelativePoint,
): [RelativePoint, RelativePoint] | null => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;

  for (const [p, q] of [
    [-dx, a[0]],
    [dx, 1 - a[0]],
    [-dy, a[1]],
    [dy, 1 - a[1]],
  ]) {
    if (p === 0) {
      if (q < 0) {
        return null;
      }
      continue;
    }

    const t = q / p;

    if (p < 0) {
      t0 = Math.max(t0, t);
    } else {
      t1 = Math.min(t1, t);
    }

    if (t0 > t1) {
      return null;
    }
  }

  // keep untouched endpoints as-is so runs chain by exact equality;
  // recomputing `a + 1 * dx` can drift from `b`
  return [
    t0 === 0 ? a : [a[0] + t0 * dx, a[1] + t0 * dy],
    t1 === 1 ? b : [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
};

const samePoint = (a: RelativePoint, b: RelativePoint) =>
  a[0] === b[0] && a[1] === b[1];

/**
 * Clips an open path to the frame. A path that leaves and re-enters the frame
 * splits into one path per inside run.
 */
const clipOpenPath = (path: RelativePoint[]): RelativePoint[][] => {
  if (path.length === 1) {
    return isInside(path[0]) ? [path] : [];
  }

  const runs: RelativePoint[][] = [];
  let run: RelativePoint[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const clipped = clipSegment(path[i], path[i + 1]);

    if (!clipped) {
      continue;
    }

    const [start, end] = clipped;
    const last = run[run.length - 1];

    if (!last || !samePoint(last, start)) {
      if (run.length > 1) {
        runs.push(run);
      }
      run = [start];
    }

    if (!samePoint(start, end)) {
      run.push(end);
    }

    // the segment exits the frame, so the run ends here
    if (!samePoint(end, path[i + 1])) {
      if (run.length > 1) {
        runs.push(run);
      }
      run = [];
    }
  }

  if (run.length > 1) {
    runs.push(run);
  }

  return runs;
};

const clipClosedPath = (path: RelativePoint[]): RelativePoint[][] => {
  const clipped = clipPolygonToRect(
    path.map(([x, y]) => ({ x, y })),
    FRAME,
  );

  return clipped.length >= 3 ? [clipped.map(({ x, y }) => [x, y])] : [];
};

/**
 * Clips polyline shapes to the frame so the part inside keeps its geometry,
 * rather than scaling the shape to fit. Shapes wholly outside are dropped.
 */
export const clipPolylineToFrame = (
  shapes: RelativePoint[][],
  closed: boolean,
): RelativePoint[][] =>
  shapes.flatMap((shape) => {
    if (shape.every(isInside)) {
      return [shape];
    }

    return closed ? clipClosedPath(shape) : clipOpenPath(shape);
  });
