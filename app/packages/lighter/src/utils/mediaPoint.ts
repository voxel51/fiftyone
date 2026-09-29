/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Point, Rect } from "../types";

/**
 * Turn a canvas pixel point into a point relative to the media rect.
 *
 * `InteractionManager` hands overlays canvas pixel coordinates — the same
 * space `DetectionOverlay` compares against its pixel `bounds`. A full-media
 * raster indexes its buffer by a fraction of the media instead, so the two
 * have to be bridged before a pixel can name a mask cell. Feeding a pixel
 * point straight to that indexing reads roughly one cell in from the origin
 * for every click, which is no hit test at all.
 *
 * Returns `undefined` for a degenerate rect: nothing has been laid out yet,
 * so no point can be placed within it.
 */
export const toRelativePoint = (
  point: Point,
  bounds: Rect | undefined,
): Point | undefined => {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return undefined;
  }

  return {
    x: (point.x - bounds.x) / bounds.width,
    y: (point.y - bounds.y) / bounds.height,
  };
};
