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
  /**
   * Float64, not Float32: `ARRAY_TYPES` admits `Float64Array` and the 32-bit
   * integer types, whose values do not all survive a float32 round trip —
   * 16_777_217 would be reported to the tooltip as 16_777_216.
   */
  values: Float64Array;
  /** The range the paint actually used, declared or inferred. */
  range: [number, number];
}

/**
 * Decode (if base64) + paint a heatmap.
 *
 * A map with more than one channel is read on channel 0, which is what
 * looker's painter does for an RGB heatmap. The remaining channels carry no
 * extra information for a heatmap — the value is scalar — so this is a stride
 * over the buffer rather than a second rendering mode.
 */
/** A pixel count has to be a whole positive number small enough to index. */
const isDimension = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0;

export const rasterizeHeatmap = (
  mapData: string | OverlayMask,
  palette: HeatmapPalette,
): RasterizedHeatmap => {
  const map = typeof mapData === "string" ? deserialize(mapData) : mapData;

  const channels = map.channels ?? 1;

  if (!Number.isSafeInteger(channels) || channels < 1) {
    throw new Error(`Invalid heatmap channel count: ${map.channels}`);
  }

  const ArrayType = ARRAY_TYPES[map.arrayType];

  if (!ArrayType) {
    throw new Error(`Unsupported heatmap array type: ${map.arrayType}`);
  }

  // `numpy.parse` copies the shape out of the header without checking it, so a
  // malformed map can arrive claiming [-1, -1] or [0.5, 2]. The payload check
  // below alone would pass both — their product is 1, which a one-element
  // buffer satisfies — and hand the caller dimensions that `createMaskCanvas`
  // and `ImageData` then reject. Fail here, where the reason can be named.
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
  const source = new ArrayType(map.buffer);

  if (source.length !== pixels * channels) {
    throw new Error(
      `Heatmap payload length mismatch: expected ${pixels * channels}, got ` +
        `${source.length}`,
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
  const values = new Float64Array(pixels);

  // `clampedIndex` divides by `stop - start`, so a degenerate range (a
  // constant map, or a `range` the user set to a single value) would make
  // every index NaN and paint nothing. There is no gradient to express in that
  // case, so fall back to the opacity ramp, which still shows where the data
  // is.
  const hasSpan = stop > start;

  const byValue =
    palette.mode === COLOR_BY.VALUE && palette.scale.length > 0 && hasSpan;

  for (let i = 0; i < pixels; i++) {
    // Channel 0 for a multi-channel map, the value itself for a plain one.
    // `channels` is 1 in the ordinary case, so this is the same read.
    const value = source[i * channels];

    values[i] = value;

    // 0 is background in both modes. So is a non-finite value: a NaN has no
    // position on the scale (`clampedIndex` returns NaN, which is not `< 0`,
    // so it would index the scale with NaN and hand `get32BitColor` an
    // undefined stop to destructure) and no meaningful opacity. Float32 maps
    // out of a model carry them.
    if (value === 0 || !Number.isFinite(value)) {
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
