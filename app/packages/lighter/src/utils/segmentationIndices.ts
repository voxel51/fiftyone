/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The two halves of an {@link IndexedImage} for a segmentation: the mask's
 * target indices as the GPU will sample them, and the palette as a lookup
 * table. Kept apart because they change on different clocks — indices per
 * frame, the table per color scheme — and the renderer uploads each only
 * when it changed.
 */

import { LRUCache } from "lru-cache";

import {
  ARRAY_TYPES,
  deserialize,
  type OverlayMask,
} from "@fiftyone/looker/src/numpy";
import { convertToHex } from "@fiftyone/looker/src/worker/painter";
import { hexToRgb } from "@fiftyone/utilities";
import { INDEXED_LUT_SIDE } from "../renderer/Renderer2D";
import {
  paletteKey,
  targetColorer,
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

  if (source instanceof Uint8ClampedArray) {
    // The on-disk decoder hands back clamped bytes: same memory, so view it
    // as plain 8-bit rather than narrowing a megapixel copy into Uint16.
    return {
      indices: new Uint8Array(source.buffer, source.byteOffset, source.length),
      width,
      height,
    };
  }

  const indices = new Uint16Array(pixels);
  for (let i = 0; i < pixels; i++) {
    const value = source[i];
    indices[i] = value > 0 ? Math.min(LUT_ENTRIES - 1, Math.floor(value)) : 0;
  }

  return { indices, width, height };
};

const rgbOf = (color: string): [number, number, number] => {
  try {
    return hexToRgb(convertToHex(color));
  } catch {
    return [255, 255, 255];
  }
};

/**
 * The palette as the shader reads it: RGBA8 for every index a `Uint16Array`
 * can hold, laid out as an {@link INDEXED_LUT_SIDE}-square texture in index
 * order. Targets the palette does not paint (background, filtered-out
 * targets) stay transparent.
 *
 * A function of the palette alone — every target is filled, whether or not a
 * given mask contains it — so one table serves every frame, 8-bit or 16-bit,
 * until the color scheme changes. Filling all 65,535 entries is cheap because
 * the colors repeat: a uniform color, a handful of explicit target colors and
 * a pool-sized ramp, so each distinct color is resolved and parsed once.
 *
 * Targets are visited in ascending order. That matters only for the ramp:
 * `getColor` assigns pool colors to values in the order they are first asked
 * for, so a fixed visiting order is what keeps the ramp from depending on
 * which pixels a frame happened to scan first.
 */
export const buildSegmentationLut = (
  palette: SegmentationPalette,
): Uint8Array => {
  const lut = new Uint8Array(LUT_ENTRIES * 4);
  const parsed = new Map<string, [number, number, number]>();
  const colorOf = targetColorer(palette);

  for (let target = 1; target < LUT_ENTRIES; target++) {
    const color = colorOf(target);
    if (color === undefined) {
      continue;
    }
    let rgb = parsed.get(color);
    if (rgb === undefined) {
      rgb = rgbOf(color);
      parsed.set(color, rgb);
    }
    const at = target * 4;
    lut[at] = rgb[0];
    lut[at + 1] = rgb[1];
    lut[at + 2] = rgb[2];
    lut[at + 3] = 255;
  }

  return lut;
};

/**
 * Tables by palette key. A table is 256 KB; a handful covers flipping
 * between color schemes, and between the fields of a multi-field view,
 * without rebuilding.
 */
const lutCache = new LRUCache<string, Uint8Array>({ max: 8 });

/**
 * The table for a palette, built once per {@link paletteKey} and shared by
 * every overlay and frame that paints under it. Shared tables are never
 * written after they are built, so the renderer's identity check (re-upload
 * only when the table object changes) stays correct.
 */
export const segmentationLutFor = (
  palette: SegmentationPalette,
): Uint8Array => {
  const key = paletteKey(palette);
  const cached = lutCache.get(key);

  if (cached) {
    return cached;
  }

  const lut = buildSegmentationLut(palette);
  lutCache.set(key, lut);
  return lut;
};
