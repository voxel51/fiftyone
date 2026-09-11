/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Math for oriented (rotated) 2D bounding boxes.
 *
 * Convention: a 2D detection's scalar `rotation` is in radians, applied in
 * image-pixel space around the box center. Positive values rotate clockwise
 * as displayed (image coordinates are y-down). This matches the 3D
 * `Detection.rotation` unit (radians) and the direction of CVAT and
 * `Polyline.from_rotated_box()`.
 *
 * `@fiftyone/looker` (explore mode) and `@fiftyone/lighter` (annotate mode)
 * must render identically, so both import this module rather than
 * implementing the transforms themselves.
 */

type Point = [number, number];

/** A normalized `[top-left-x, top-left-y, width, height]` bounding box. */
type BoxDescriptor = readonly [number, number, number, number];

/** `[width, height]` of the source media, in pixels. */
type MediaDimensions = readonly [number, number];

/**
 * Extracts a 2D scalar rotation from a detection's `rotation` attribute.
 *
 * Returns `0` for absent, non-numeric (e.g. the 3D `[x, y, z]` list), or
 * non-finite values, so callers can branch on truthiness.
 */
export const getRotation2d = (rotation: unknown): number =>
  typeof rotation === "number" && Number.isFinite(rotation) ? rotation : 0;

/**
 * Computes the corners of a rotated bounding box, in normalized coordinates.
 *
 * The rotation is applied in pixel space, so the box remains rectangular on
 * screen for non-square media.
 *
 * @returns corners in top-left, top-right, bottom-right, bottom-left order
 *   (of the unrotated box)
 */
export const getRotatedBoxCorners = (
  boundingBox: BoxDescriptor,
  rotation: number,
  dimensions: MediaDimensions,
): [Point, Point, Point, Point] => {
  const [tlx, tly, w, h] = boundingBox;
  const [mw, mh] = dimensions;

  const cx = (tlx + w / 2) * mw;
  const cy = (tly + h / 2) * mh;
  const hw = (w * mw) / 2;
  const hh = (h * mh) / 2;

  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  const corner = (x: number, y: number): Point => [
    (cx + x * cos - y * sin) / mw,
    (cy + x * sin + y * cos) / mh,
  ];

  return [corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh)];
};

/**
 * Tests whether a pixel-space point lies within a rotated bounding box.
 *
 * The point is inverse-rotated into the box's local frame around its center,
 * reducing the test to an axis-aligned comparison. `padding` (pixels) expands
 * the box on every side, e.g. to make thin boxes hoverable at stroke width.
 */
export const isPointInRotatedBox = (
  point: Point,
  boundingBox: BoxDescriptor,
  rotation: number,
  dimensions: MediaDimensions,
  padding = 0,
): boolean => {
  const [lx, ly] = toRotatedBoxFrame(point, boundingBox, rotation, dimensions);
  const [, , w, h] = boundingBox;
  const [mw, mh] = dimensions;

  return (
    Math.abs(lx) <= (w * mw) / 2 + padding &&
    Math.abs(ly) <= (h * mh) / 2 + padding
  );
};

/**
 * Transforms a pixel-space point into a rotated box's local frame: the origin
 * is the box center and the axes follow the unrotated box edges.
 */
export const toRotatedBoxFrame = (
  point: Point,
  boundingBox: BoxDescriptor,
  rotation: number,
  dimensions: MediaDimensions,
): Point => {
  const [tlx, tly, w, h] = boundingBox;
  const [mw, mh] = dimensions;

  const dx = point[0] - (tlx + w / 2) * mw;
  const dy = point[1] - (tly + h / 2) * mh;

  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  return [dx * cos + dy * sin, -dx * sin + dy * cos];
};

/**
 * Interpolates between two rotations along the shortest arc, so a keyframe
 * pair like 350° → 10° turns 20° through zero rather than 340° backwards.
 * Matches CVAT's video-track interpolation semantics.
 *
 * @returns radians, normalized into `[0, 2*pi)`
 */
export const lerpRotation = (from: number, to: number, t: number): number => {
  const TWO_PI = 2 * Math.PI;

  let diff = (to - from) % TWO_PI;
  if (diff > Math.PI) {
    diff -= TWO_PI;
  } else if (diff < -Math.PI) {
    diff += TWO_PI;
  }

  return (((from + diff * t) % TWO_PI) + TWO_PI) % TWO_PI;
};
