/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

export interface MaskBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Computes the tight axis-aligned bounding box of opaque pixels in an
 * `ImageData`. A pixel is "opaque" if its alpha byte is non-zero.
 *
 * Used to crop the editing canvas to the actual painted region after a
 * stroke ends, and to size new canvases when extending bounds during paint.
 *
 * @param maskData - Source `ImageData` (RGBA, alpha channel determines fill).
 * @returns Inclusive bounding box `{ minX, minY, maxX, maxY }` (in canvas
 *   pixels) covering all opaque pixels — the box covers the pixels from
 *   `minX..maxX` and `minY..maxY`, **both endpoints included**. Returns
 *   `null` when the image has no opaque pixels.
 */
export const maskBounds = (maskData: ImageData): MaskBounds | null => {
  const { data, height, width } = maskData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      if (data[(py * width + px) * 4 + 3] > 0) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
  };
};
