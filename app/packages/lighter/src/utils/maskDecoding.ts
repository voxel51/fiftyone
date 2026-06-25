/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  ARRAY_TYPES,
  deserialize,
  type OverlayMask,
} from "@fiftyone/looker/src/numpy";

export interface DecodedMask {
  bitmap: ImageBitmap;
  /** Single-channel pixel data for hit-testing (non-zero = mask). */
  rawPixels: { src: Uint8Array; width: number; height: number };
}

/**
 * Decodes a mask source into a color-INDEPENDENT white+alpha ImageBitmap
 * ready for GPU tinting, alongside the raw single-channel pixel data for
 * hit-testing.
 *
 * The bitmap encodes only the mask SHAPE — opaque white where the mask is
 * present, transparent elsewhere. The display color is applied at draw time
 * via the renderer's per-sprite tint (`white × tint = tint`), so a color or
 * colorscheme change never re-decodes or re-rasterizes; it just re-tints.
 *
 * Accepts either a base64-encoded numpy string (inline `mask` field) or a
 * pre-decoded {@link OverlayMask} (e.g. produced from a `mask_path` fetch).
 * The string path runs the full base64 → inflate → numpy parse pipeline; the
 * `OverlayMask` path skips straight to rasterizing.
 *
 * @param maskData - Base64-encoded compressed numpy string, or a decoded
 *   {@link OverlayMask}.
 */
export async function decodeMask(
  maskData: string | OverlayMask
): Promise<DecodedMask> {
  const overlayMask =
    typeof maskData === "string" ? deserialize(maskData) : maskData;
  const rgbaBuffer = rasterizeMaskAlpha(overlayMask);
  const [height, width] = overlayMask.shape;
  const imageData = new ImageData(
    new Uint8ClampedArray(rgbaBuffer),
    width,
    height
  );
  const bitmap = await createImageBitmap(imageData);

  const ArrayType = ARRAY_TYPES[overlayMask.arrayType];
  if (!ArrayType) {
    throw new Error(`Unsupported mask array type: ${overlayMask.arrayType}`);
  }

  const typed = new ArrayType(overlayMask.buffer);
  const src = new Uint8Array(typed.length);
  for (let i = 0; i < typed.length; i++) {
    src[i] = typed[i] ? 1 : 0;
  }

  return { bitmap, rawPixels: { src, width, height } };
}

/**
 * Rasterizes a single-channel mask into a color-INDEPENDENT RGBA buffer:
 * non-zero mask values become opaque white, zero values stay transparent.
 * The display color is applied later via GPU tint, so this never bakes a
 * color in and never needs to re-run on a color change.
 */
function rasterizeMaskAlpha(mask: OverlayMask): ArrayBuffer {
  if (mask.channels !== 1) {
    throw new Error(`Expected single-channel mask, got ${mask.channels}`);
  }

  const [height, width] = mask.shape;
  const rgbaBuffer = new ArrayBuffer(width * height * 4);
  const overlay = new Uint32Array(rgbaBuffer);

  // Opaque white (RGBA 255,255,255,255 → 0xFFFFFFFF in any byte order).
  const WHITE = 0xffffffff;
  const ArrayType = ARRAY_TYPES[mask.arrayType];

  if (!ArrayType) {
    throw new Error(`Unsupported mask array type: ${mask.arrayType}`);
  }

  const targets = new ArrayType(mask.buffer);
  const expectedPixels = width * height;

  if (targets.length !== expectedPixels) {
    throw new Error(
      `Mask payload length mismatch: expected ${expectedPixels}, got ${targets.length}`
    );
  }

  for (let i = 0; i < expectedPixels; i++) {
    if (targets[i]) {
      overlay[i] = WHITE;
    }
  }

  return rgbaBuffer;
}
