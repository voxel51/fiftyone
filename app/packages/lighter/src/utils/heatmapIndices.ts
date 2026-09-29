/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The two halves of an {@link IndexedImage} for a heatmap: the map's values
 * quantized to 16-bit indices, and the palette as a lookup table over those
 * indices. The same shader that colors a 16-bit segmentation colors this —
 * a heatmap value is just an index into a finer table — so the per-pixel
 * color decision that `heatmapRaster` made on the CPU is made once per table
 * entry instead, and the GPU applies it.
 *
 * Index 0 is background (a zero or non-finite value). Indices 1..65535 span
 * `[-max, max]` where `max` is the larger magnitude of the range's two ends,
 * because field mode ramps opacity by DISTANCE FROM ZERO and value mode
 * indexes the scale by position in the range — one domain covers both.
 */

import {
  ARRAY_TYPES,
  deserialize,
  type OverlayMask,
  type TypedArray,
} from "@fiftyone/looker/src/numpy";
import { isFloatArray } from "@fiftyone/looker/src/util";
import { clampedIndex } from "@fiftyone/looker/src/worker/painter";
import { COLOR_BY, get32BitColor } from "@fiftyone/utilities";

import { INDEXED_LUT_SIDE } from "../renderer/Renderer2D";
import type { HeatmapPalette } from "./heatmapPalette";

export interface DecodedHeatmap {
  /** 0 = background; 1..65535 = position in `[-max, max]`. */
  indices: Uint16Array;
  width: number;
  height: number;
  /**
   * The decoded values as stored, for the tooltip — a view over the payload,
   * strided by `channels`. Not the quantized indices: a value has to be
   * reported exactly.
   */
  values: TypedArray;
  channels: number;
  /** The range the indices were quantized over, declared or inferred. */
  range: [number, number];
}

const LUT_ENTRIES = INDEXED_LUT_SIDE * INDEXED_LUT_SIDE;

/** Indices 1..LUT_ENTRIES-1 carry values; 0 is background. */
const VALUE_STEPS = LUT_ENTRIES - 2;

const isDimension = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0;

/** The larger magnitude of the range's ends — the domain's half-width. */
const domainOf = (range: readonly [number, number]): number =>
  Math.max(Math.abs(range[0]), Math.abs(range[1]));

/**
 * The range a map paints over: the declared one, else inferred from the
 * array's type — floats are assumed normalized to [0, 1], integers to a
 * byte's [0, 255]. Mirrors `heatmapRaster`.
 */
export const resolveHeatmapRange = (
  values: TypedArray,
  range: readonly [number, number] | undefined,
): [number, number] =>
  range ? [range[0], range[1]] : isFloatArray(values) ? [0, 1] : [0, 255];

/**
 * Decode (if base64) a heatmap and quantize its values to indices.
 *
 * A map with more than one channel is read on channel 0, as looker's painter
 * does for an RGB heatmap — the value is scalar.
 */
export const decodeHeatmapIndices = (
  mapData: string | OverlayMask,
  range?: readonly [number, number],
): DecodedHeatmap => {
  const map = typeof mapData === "string" ? deserialize(mapData) : mapData;

  const channels = map.channels ?? 1;

  if (!Number.isSafeInteger(channels) || channels < 1) {
    throw new Error(`Invalid heatmap channel count: ${map.channels}`);
  }

  const ArrayType = ARRAY_TYPES[map.arrayType];

  if (!ArrayType) {
    throw new Error(`Unsupported heatmap array type: ${map.arrayType}`);
  }

  if (map.shape?.length !== 2) {
    throw new Error(
      `Expected a 2-D heatmap shape, got ${JSON.stringify(map.shape)}`,
    );
  }

  const [height, width] = map.shape;

  if (!isDimension(width) || !isDimension(height)) {
    throw new Error(
      `Invalid heatmap dimensions: ${JSON.stringify([height, width])}`,
    );
  }

  const pixels = width * height;
  const values = new ArrayType(map.buffer);

  if (values.length !== pixels * channels) {
    throw new Error(
      `Heatmap payload length mismatch: expected ${pixels * channels}, got ` +
        `${values.length}`,
    );
  }

  const resolved = resolveHeatmapRange(values, range);
  const max = domainOf(resolved);
  const indices = new Uint16Array(pixels);

  for (let i = 0; i < pixels; i++) {
    const value = values[i * channels];

    // 0 is background, and so is a value with no position on any scale.
    if (value === 0 || !Number.isFinite(value)) {
      continue;
    }

    if (max === 0) {
      // A degenerate range has no gradient to express; every value is "on".
      indices[i] = LUT_ENTRIES - 1;
      continue;
    }

    const clamped = Math.min(max, Math.max(-max, value));
    indices[i] = 1 + Math.round(((clamped + max) / (2 * max)) * VALUE_STEPS);
  }

  return { indices, width, height, values, channels, range: resolved };
};

/**
 * The palette as the shader reads it: RGBA8 for every index, laid out as an
 * {@link INDEXED_LUT_SIDE}-square texture in index order. Entry `i` holds the
 * color `heatmapRaster` would have painted for the value at the center of
 * that index's bucket, in either mode:
 *
 * - by FIELD: one color, opacity proportional to |value| over the range.
 * - by VALUE: full opacity, color from the scale indexed across the range;
 *   values below the range start are background.
 */
export const buildHeatmapLut = (
  range: readonly [number, number],
  palette: HeatmapPalette,
): Uint8Array => {
  const lut = new Uint8Array(LUT_ENTRIES * 4);
  const packed = new Uint32Array(lut.buffer);
  const [start, stop] = range;
  const max = domainOf(range);
  const hasSpan = stop > start;
  const byValue =
    palette.mode === COLOR_BY.VALUE && palette.scale.length > 0 && hasSpan;

  // Entry 0 stays transparent: background.
  for (let i = 1; i < LUT_ENTRIES; i++) {
    const value = max === 0 ? 1 : -max + ((i - 1) / VALUE_STEPS) * 2 * max;

    if (byValue) {
      const index = clampedIndex(value, start, stop, palette.scale.length);

      if (index < 0) {
        continue;
      }

      packed[i] = get32BitColor(palette.scale[index]);
      continue;
    }

    packed[i] = get32BitColor(
      palette.fieldColor,
      max === 0 ? 1 : Math.min(max, Math.abs(value)) / max,
    );
  }

  return lut;
};
