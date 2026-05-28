/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  ARRAY_TYPES,
  deserialize,
  type OverlayMask,
} from "@fiftyone/looker/src/numpy";
import { parseColorToRGBA } from "./color";

export interface DecodedMask {
  bitmap: ImageBitmap;
  /** Single-channel pixel data for hit-testing (non-zero = mask). */
  rawPixels: { src: Uint8Array; width: number; height: number };
}

/**
 * Decodes a mask source and paints it with the given color, returning an
 * ImageBitmap ready for rendering alongside the raw single-channel pixel
 * data for hit-testing.
 *
 * Accepts either a base64-encoded numpy string (inline `mask` field) or a
 * pre-decoded {@link OverlayMask} (e.g. produced from a `mask_path` fetch).
 * The string path runs the full base64 → inflate → numpy parse pipeline; the
 * `OverlayMask` path skips straight to painting.
 *
 * @param maskData - Base64-encoded compressed numpy string, or a decoded
 *   {@link OverlayMask}.
 * @param color - CSS color string for non-zero mask pixels.
 */
export async function decodeMask(
  maskData: string | OverlayMask,
  color: string
): Promise<DecodedMask> {
  const overlayMask =
    typeof maskData === "string" ? deserialize(maskData) : maskData;
  const rgbaBuffer = paintMask(overlayMask, color);
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
 * Paints a deserialized mask into an RGBA buffer using the given color.
 * Non-zero mask values become the color; zero values stay transparent.
 */
function paintMask(mask: OverlayMask, cssColor: string): ArrayBuffer {
  if (mask.channels !== 1) {
    throw new Error(`Expected single-channel mask, got ${mask.channels}`);
  }

  const [height, width] = mask.shape;
  const rgbaBuffer = new ArrayBuffer(width * height * 4);
  const overlay = new Uint32Array(rgbaBuffer);

  const { r, g, b, a } = parseColorToRGBA(cssColor);

  // Pack as RGBA (little-endian: ABGR in Uint32)
  const packedColor = (a << 24) | (b << 16) | (g << 8) | r;
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
      overlay[i] = packedColor;
    }
  }

  return rgbaBuffer;
}
