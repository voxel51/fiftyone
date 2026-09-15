/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Pure heatmap decode + paint — no DOM, so it runs identically on the main
 * thread and inside a worker.
 *
 * Like a segmentation and unlike a detection mask, the color varies per pixel,
 * so it is baked into the RGBA here rather than applied as a GPU tint.
 */

import {
  ARRAY_TYPES,
  deserialize,
  type OverlayMask,
} from "@fiftyone/looker/src/numpy";
import { isFloatArray } from "@fiftyone/looker/src/util";
import { clampedIndex } from "@fiftyone/looker/src/worker/painter";
import { get32BitColor } from "@fiftyone/utilities";

import { COLOR_BY } from "@fiftyone/utilities";

import type { HeatmapPalette } from "./heatmapPalette";

export interface RasterizedHeatmap {
  /** Painted RGBA, row-major, `width * height * 4` bytes. */
  rgba: ArrayBuffer;
  width: number;
  height: number;
  /** The value under each pixel, for the tooltip. */
  values: Float32Array;
  /** The range the paint actually used, declared or inferred. */
  range: [number, number];
}

/**
 * Decode (if base64) + paint a heatmap.
 *
 * @throws If the map is not single-channel. Looker reads channel 0 of an RGB
 *   map, but that path is untested here and guessing at it would paint
 *   plausible-looking nonsense.
 */
export const rasterizeHeatmap = (
  mapData: string | OverlayMask,
  palette: HeatmapPalette,
): RasterizedHeatmap => {
  const map = typeof mapData === "string" ? deserialize(mapData) : mapData;

  if (map.channels !== 1) {
    throw new Error(
      `Expected a single-channel heatmap, got ${map.channels} channels`,
    );
  }

  const ArrayType = ARRAY_TYPES[map.arrayType];

  if (!ArrayType) {
    throw new Error(`Unsupported heatmap array type: ${map.arrayType}`);
  }

  const [height, width] = map.shape;
  const pixels = width * height;
  const source = new ArrayType(map.buffer);

  if (source.length !== pixels) {
    throw new Error(
      `Heatmap payload length mismatch: expected ${pixels}, got ${source.length}`,
    );
  }

  // An undeclared range is inferred from the array's type: floats are assumed
  // normalized to [0, 1], integers to a byte's [0, 255].
  const [start, stop] =
    palette.range ?? (isFloatArray(source) ? [0, 1] : [0, 255]);

  // Opacity is proportional to DISTANCE FROM ZERO, not position within the
  // range, which is what makes an asymmetric range like [-50, 100] render 0
  // transparent and both ends visible.
  const max = Math.max(Math.abs(start), Math.abs(stop));

  const rgba = new ArrayBuffer(pixels * 4);
  const overlay = new Uint32Array(rgba);
  const values = new Float32Array(pixels);

  // `clampedIndex` divides by `stop - start`, so a degenerate range (a
  // constant map, or a `range` the user set to a single value) would make
  // every index NaN and paint nothing. There is no gradient to express in that
  // case, so fall back to the opacity ramp, which still shows where the data
  // is.
  const hasSpan = stop > start;

  const byValue =
    palette.mode === COLOR_BY.VALUE && palette.scale.length > 0 && hasSpan;

  for (let i = 0; i < pixels; i++) {
    const value = source[i];

    values[i] = value;

    // 0 is background in both modes
    if (value === 0) {
      continue;
    }

    if (byValue) {
      const index = clampedIndex(value, start, stop, palette.scale.length);

      // below the range start is background
      if (index < 0) {
        continue;
      }

      overlay[i] = get32BitColor(palette.scale[index]);
      continue;
    }

    overlay[i] = get32BitColor(
      palette.fieldColor,
      max === 0 ? 1 : Math.min(max, Math.abs(value)) / max,
    );
  }

  return { rgba, width, height, values, range: [start, stop] };
};
