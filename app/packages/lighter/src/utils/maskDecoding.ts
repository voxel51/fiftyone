/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  ARRAY_TYPES,
  deserialize,
  type OverlayMask,
} from "@fiftyone/looker/src/numpy";
import { parseColorWithAlpha } from "./color";

export interface DecodedMask {
  bitmap: ImageBitmap;
  /** Single-channel pixel data for hit-testing (non-zero = mask). */
  rawPixels: { src: Uint8Array; width: number; height: number };
}

/**
 * Decodes a base64-encoded numpy mask string and paints it with the given
 * color, returning an ImageBitmap ready for rendering alongside the raw
 * single-channel pixel data for hit-testing.
 *
 * Pipeline: base64 → inflate → numpy parse → paint RGBA → ImageBitmap
 *
 * @param maskData - Base64-encoded, zlib-compressed numpy array
 * @param color - CSS color string for non-zero mask pixels
 */
export async function decodeMask(
  maskData: string,
  color: string
): Promise<DecodedMask> {
  const overlayMask = deserialize(maskData);
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
  const [height, width] = mask.shape;
  const rgbaBuffer = new ArrayBuffer(width * height * 4);
  const overlay = new Uint32Array(rgbaBuffer);

  const { color: hexColor, alpha } = parseColorWithAlpha(cssColor);
  const r = (hexColor >> 16) & 0xff;
  const g = (hexColor >> 8) & 0xff;
  const b = hexColor & 0xff;
  const a = Math.round(alpha * 255);

  // Pack as RGBA (little-endian: ABGR in Uint32)
  const packedColor = (a << 24) | (b << 16) | (g << 8) | r;

  const ArrayType = ARRAY_TYPES[mask.arrayType];
  if (!ArrayType) {
    throw new Error(`Unsupported mask array type: ${mask.arrayType}`);
  }
  const targets = new ArrayType(mask.buffer);

  for (let i = 0; i < targets.length; i++) {
    if (targets[i]) {
      overlay[i] = packedColor;
    }
  }

  return rgbaBuffer;
}
