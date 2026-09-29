/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The two halves of an {@link IndexedImage} for a segmentation: the mask's
 * target indices as the GPU will sample them, and the palette as a lookup
 * table. Kept apart because they change on different clocks — indices per
 * frame, the table per color scheme — and the renderer uploads each only
 * when it changed.
 */

import {
  ARRAY_TYPES,
  deserialize,
  type OverlayMask,
} from "@fiftyone/looker/src/numpy";
import { convertToHex } from "@fiftyone/looker/src/worker/painter";
import { hexToRgb } from "@fiftyone/utilities";
import { INDEXED_LUT_SIDE } from "../renderer/Renderer2D";
import {
  colorForTarget,
  type SegmentationPalette,
} from "./segmentationPalette";

export type SegmentationIndices = Uint8Array | Uint16Array;

export interface DecodedSegmentation {
  indices: SegmentationIndices;
  width: number;
  height: number;
}

const LUT_ENTRIES = INDEXED_LUT_SIDE * INDEXED_LUT_SIDE;

const isDimension = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0;

/**
 * The mask's per-pixel targets, in the narrowest unsigned width that holds
 * them. An 8- or 16-bit unsigned mask is a view over the decoded bytes — no
 * copy. Wider or signed arrays are narrowed to Uint16, since a target is a
 * small non-negative integer by definition and the lookup table holds 65536.
 */
export const decodeSegmentationIndices = (
  maskData: string | OverlayMask,
): DecodedSegmentation => {
  const mask = typeof maskData === "string" ? deserialize(maskData) : maskData;

  if (mask.channels !== 1) {
    throw new Error(
      `Expected a single-channel segmentation mask, got ${mask.channels} ` +
        "channels (RGB mask targets are not supported on this surface)",
    );
  }

  const ArrayType = ARRAY_TYPES[mask.arrayType];

  if (!ArrayType) {
    throw new Error(`Unsupported mask array type: ${mask.arrayType}`);
  }

  if (mask.shape?.length !== 2) {
    throw new Error(
      `Expected a 2-D segmentation mask shape, got ${JSON.stringify(
        mask.shape,
      )}`,
    );
  }

  const [height, width] = mask.shape;

  if (!isDimension(width) || !isDimension(height)) {
    throw new Error(
      `Invalid segmentation mask dimensions: ${JSON.stringify([
        height,
        width,
      ])}`,
    );
  }

  const pixels = width * height;
  const source = new ArrayType(mask.buffer);

  if (source.length !== pixels) {
    throw new Error(
      `Mask payload length mismatch: expected ${pixels}, got ${source.length}`,
    );
  }

  if (source instanceof Uint8Array || source instanceof Uint16Array) {
    return { indices: source, width, height };
  }

  const indices = new Uint16Array(pixels);
  for (let i = 0; i < pixels; i++) {
    const value = source[i];
    indices[i] = value > 0 ? Math.min(LUT_ENTRIES - 1, Math.floor(value)) : 0;
  }

  return { indices, width, height };
};

/** Every target index that occurs in the mask, background excluded. */
const targetsIn = (indices: SegmentationIndices): Iterable<number> => {
  if (indices instanceof Uint8Array) {
    // 255 lookups beat a scan of the pixels, and the table has room anyway
    return Array.from({ length: 255 }, (_, i) => i + 1);
  }

  const present = new Set<number>();
  for (let i = 0; i < indices.length; i++) {
    const value = indices[i];
    if (value !== 0) {
      present.add(value);
    }
  }
  return present;
};

const rgbOf = (color: string): [number, number, number] => {
  try {
    return hexToRgb(convertToHex(color));
  } catch {
    return [255, 255, 255];
  }
};

/**
 * The palette as the shader reads it: RGBA8 for every index, laid out as an
 * {@link INDEXED_LUT_SIDE}-square texture in index order. Targets the palette
 * does not paint (background, filtered-out targets) stay transparent.
 *
 * Which entries are filled depends on the mask: an 8-bit mask fills all 255
 * possible targets, so the table is reusable across frames of the same
 * palette; a 16-bit mask fills the targets it actually contains.
 */
export const buildSegmentationLut = (
  indices: SegmentationIndices,
  palette: SegmentationPalette,
): Uint8Array => {
  const lut = new Uint8Array(LUT_ENTRIES * 4);

  for (const target of targetsIn(indices)) {
    const color = colorForTarget(target, palette);
    if (color === undefined) {
      continue;
    }
    const [r, g, b] = rgbOf(color);
    const at = target * 4;
    lut[at] = r;
    lut[at + 1] = g;
    lut[at + 2] = b;
    lut[at + 3] = 255;
  }

  return lut;
};
