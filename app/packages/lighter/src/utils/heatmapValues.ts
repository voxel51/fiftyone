/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The two halves of a {@link ScalarImage} for a heatmap: the map's values as
 * decoded, and the palette as a short color ramp plus a mode. The range
 * mapping and the per-pixel color decision that `heatmapRaster` makes on the
 * CPU happen in `ScalarMaskMesh`'s fragment shader instead, so decoding a
 * frame is the whole of its CPU cost, and a range or palette change touches
 * no pixel at all.
 *
 * 0 is background, and so is a non-finite value. The shader reproduces the
 * rest of looker's painter: by FIELD, one color with opacity ramped by
 * DISTANCE FROM ZERO over the range's larger magnitude; by VALUE, the scale
 * indexed by position in the range (`clampedIndex`), with values below the
 * range start as background.
 */

import {
  ARRAY_TYPES,
  deserialize,
  type OverlayMask,
  type TypedArray,
} from "@fiftyone/looker/src/numpy";
import { isFloatArray } from "@fiftyone/looker/src/util";
import { COLOR_BY, get32BitColor } from "@fiftyone/utilities";

import type { ScalarImage } from "../renderer/Renderer2D";
import type { HeatmapPalette } from "./heatmapPalette";

export interface DecodedHeatmap {
  /**
   * One value per pixel, as stored — channel 0 of a multi-channel map. Both
   * what the GPU colors and what the tooltip reports, so a value is reported
   * exactly.
   */
  values: TypedArray;
  width: number;
  height: number;
}

const isDimension = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0;

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
 * Decode (if base64) a heatmap to its values. Independent of the range and
 * palette, so one decode serves every color scheme.
 *
 * A map with more than one channel is read on channel 0, as looker's painter
 * does for an RGB heatmap — the value is scalar. That is the one case that
 * copies: the shader samples a single-channel texture.
 */
export const decodeHeatmap = (
  mapData: string | OverlayMask,
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
  const stored = new ArrayType(map.buffer);

  if (stored.length !== pixels * channels) {
    throw new Error(
      `Heatmap payload length mismatch: expected ${pixels * channels}, got ` +
        `${stored.length}`,
    );
  }

  if (channels === 1) {
    return { values: stored, width, height };
  }

  const values = new ArrayType(pixels);

  for (let i = 0; i < pixels; i++) {
    values[i] = stored[i * channels];
  }

  return { values, width, height };
};

/** How a heatmap's values are colored; the palette half of a ScalarImage. */
export type HeatmapShading = Pick<ScalarImage, "mode" | "ramp">;

/**
 * The palette as the shader reads it.
 *
 * - by VALUE: the scale's stops, in order, at full opacity. Needs a scale to
 *   index and a range with a span to index it over; without either, falls
 *   back to field mode, as the lookup table this replaced did.
 * - by FIELD: one entry, the field color at full opacity; the shader ramps
 *   its opacity per pixel.
 */
export const buildHeatmapShading = (
  range: readonly [number, number],
  palette: HeatmapPalette,
): HeatmapShading => {
  const [start, stop] = range;
  const byValue =
    palette.mode === COLOR_BY.VALUE && palette.scale.length > 0 && stop > start;

  if (!byValue) {
    const ramp = new Uint8Array(4);
    new Uint32Array(ramp.buffer)[0] = get32BitColor(palette.fieldColor);
    return { mode: "field", ramp };
  }

  const ramp = new Uint8Array(palette.scale.length * 4);
  const packed = new Uint32Array(ramp.buffer);

  for (let i = 0; i < palette.scale.length; i++) {
    packed[i] = get32BitColor(palette.scale[i]);
  }

  return { mode: "value", ramp };
};
