/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Pure mask decode + rasterization — no DOM, runs identically on the main
 * thread (fallback) and inside `maskDecodeWorker`. Produces a color-INDEPENDENT
 * white+alpha RGBA buffer (the display color is applied later via GPU tint)
 * plus the single-channel pixel data used for hit-testing.
 */

import {
  ARRAY_TYPES,
  deserialize,
  type OverlayMask,
} from "@fiftyone/looker/src/numpy";

export interface RasterizedMask {
  /** White+alpha RGBA, row-major, `width * height * 4` bytes. */
  rgba: ArrayBuffer;
  width: number;
  height: number;
  /** Single-channel mask (non-zero source → 1) for hit-testing. */
  rawPixels: Uint8Array;
}

/**
 * Decode (if base64) + rasterize a mask source. This is the heavy work — the
 * base64 → inflate → numpy parse pipeline and the two per-pixel passes — and
 * is exactly what the worker offloads from the main thread.
 *
 * @param maskData - Base64-encoded compressed numpy string, or a decoded
 *   {@link OverlayMask}.
 */
export const decodeMaskToRaster = (
  maskData: string | OverlayMask
): RasterizedMask => {
  const mask = typeof maskData === "string" ? deserialize(maskData) : maskData;

  if (mask.channels !== 1) {
    throw new Error(`Expected single-channel mask, got ${mask.channels}`);
  }

  const ArrayType = ARRAY_TYPES[mask.arrayType];
  if (!ArrayType) {
    throw new Error(`Unsupported mask array type: ${mask.arrayType}`);
  }

  const [height, width] = mask.shape;
  const expectedPixels = width * height;
  const targets = new ArrayType(mask.buffer);

  if (targets.length !== expectedPixels) {
    throw new Error(
      `Mask payload length mismatch: expected ${expectedPixels}, got ${targets.length}`
    );
  }

  // White+alpha RGBA (0xFFFFFFFF where present), color-independent.
  const rgba = new ArrayBuffer(expectedPixels * 4);
  const overlay = new Uint32Array(rgba);
  const rawPixels = new Uint8Array(expectedPixels);

  for (let i = 0; i < expectedPixels; i++) {
    if (targets[i]) {
      overlay[i] = 0xffffffff;
      rawPixels[i] = 1;
    }
  }

  return { rgba, width, height, rawPixels };
};
