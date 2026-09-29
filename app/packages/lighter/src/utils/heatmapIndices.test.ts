/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { OverlayMask } from "@fiftyone/looker/src/numpy";
import type { ColorSchemeInput } from "@fiftyone/relay";
import { describe, expect, it } from "vitest";

import {
  buildHeatmapLut,
  decodeHeatmapIndices,
  resolveHeatmapRange,
} from "./heatmapIndices";
import { resolveHeatmapPalette } from "./heatmapPalette";
import { rasterizeHeatmap } from "./heatmapRaster";

const PATH = "frames.heatmap";
const SCALE = [
  [0, 0, 0],
  [128, 128, 128],
  [255, 255, 255],
];

const scheme = (overrides: Partial<ColorSchemeInput> = {}): ColorSchemeInput =>
  ({
    colorPool: ["#ff0000"],
    colorBy: "field",
    fields: [],
    colorscales: [],
    defaultColorscale: { name: "gray", list: null, rgb: SCALE },
    ...overrides,
  }) as unknown as ColorSchemeInput;

const palette = (
  overrides: Partial<ColorSchemeInput> = {},
  range: number[] | null = null,
) => resolveHeatmapPalette(PATH, scheme(overrides), 7, range);

/** A decoded single-channel map. */
const map = (
  values: number[],
  width: number,
  Type: Float32ArrayConstructor | Uint8ArrayConstructor = Float32Array,
): OverlayMask =>
  ({
    channels: 1,
    arrayType: Type === Float32Array ? "Float32Array" : "Uint8Array",
    shape: [values.length / width, width],
    buffer: new Type(values).buffer,
  }) as unknown as OverlayMask;

const LAST = 256 * 256 - 1;

describe("decodeHeatmapIndices", () => {
  it("sends zero and non-finite values to the background index", () => {
    const { indices } = decodeHeatmapIndices(map([0, Number.NaN, 0.5, 1], 2));

    expect(indices[0]).toBe(0);
    expect(indices[1]).toBe(0);
    expect(indices[2]).toBeGreaterThan(0);
  });

  it("spans [-max, max] so both ends of an asymmetric range are distinct", () => {
    const { indices, range } = decodeHeatmapIndices(
      map([-50, 100, 0, 50], 2),
      [-50, 100],
    );

    expect(range).toEqual([-50, 100]);
    // 100 is the domain's far end; -50 sits a quarter of the way in.
    expect(indices[1]).toBe(LAST);
    expect(indices[0]).toBe(1 + Math.round(0.25 * (LAST - 1)));
    // 50 and -50 are equidistant from the middle, to within rounding.
    expect(Math.abs(indices[3] + indices[0] - (LAST + 1))).toBeLessThanOrEqual(
      1,
    );
  });

  it("clamps values beyond the range to the domain's ends", () => {
    const { indices } = decodeHeatmapIndices(map([5, -5], 2), [0, 1]);

    expect(indices[0]).toBe(LAST);
    expect(indices[1]).toBe(1);
  });

  it("infers the range from the array type when none is declared", () => {
    expect(decodeHeatmapIndices(map([0.5, 1], 2)).range).toEqual([0, 1]);
    expect(decodeHeatmapIndices(map([10, 200], 2, Uint8Array)).range).toEqual([
      0, 255,
    ]);
    expect(resolveHeatmapRange(new Uint8Array(1), [3, 4])).toEqual([3, 4]);
  });

  it("keeps the exact values, strided by channel, for the tooltip", () => {
    const rgb = {
      channels: 3,
      arrayType: "Uint8Array",
      shape: [1, 2],
      buffer: new Uint8Array([7, 1, 1, 200, 2, 2]).buffer,
    } as unknown as OverlayMask;

    const { values, channels, indices } = decodeHeatmapIndices(rgb);

    expect(channels).toBe(3);
    expect(values[0 * channels]).toBe(7);
    expect(values[1 * channels]).toBe(200);
    expect(indices).toHaveLength(2);
  });

  it("rejects a map whose payload does not match its shape", () => {
    const short = {
      channels: 1,
      arrayType: "Uint8Array",
      shape: [2, 2],
      buffer: new Uint8Array([1, 2, 3]).buffer,
    } as unknown as OverlayMask;

    expect(() => decodeHeatmapIndices(short)).toThrow(/length mismatch/);
  });
});

/** The RGBA the table holds for an index. */
const lutColor = (lut: Uint8Array, index: number): number[] =>
  Array.from(lut.subarray(index * 4, index * 4 + 4));

/** The RGBA the CPU raster painted for a pixel. */
const rasterColor = (rgba: ArrayBuffer, pixel: number): number[] =>
  Array.from(new Uint8Array(rgba, pixel * 4, 4));

describe("buildHeatmapLut", () => {
  it("leaves the background index transparent", () => {
    const lut = buildHeatmapLut([0, 1], palette());

    expect(lutColor(lut, 0)).toEqual([0, 0, 0, 0]);
  });

  /**
   * The table has to reproduce what `rasterizeHeatmap` painted, in both
   * modes, within the quantization step — one table entry per 1/65534 of the
   * domain, so an 8-bit value lands exactly.
   */
  const parity = (
    values: number[],
    pal: ReturnType<typeof palette>,
    tolerance = 1,
  ) => {
    const source = map(values, values.length, Uint8Array);
    const { rgba } = rasterizeHeatmap(source, pal);
    const { indices, range } = decodeHeatmapIndices(source, pal.range);
    const lut = buildHeatmapLut(range, pal);

    values.forEach((_, pixel) => {
      const expected = rasterColor(rgba, pixel);
      const actual = lutColor(lut, indices[pixel]);

      actual.forEach((channel, i) => {
        expect(Math.abs(channel - expected[i])).toBeLessThanOrEqual(tolerance);
      });
    });
  };

  it("matches the CPU raster in field mode", () => {
    parity([0, 10, 128, 255, 64], palette());
  });

  it("matches the CPU raster in field mode over an asymmetric range", () => {
    parity([0, 10, 128, 255, 64], palette({}, [-50, 100]));
  });

  it("matches the CPU raster in value mode", () => {
    parity([0, 10, 128, 255, 64], palette({ colorBy: "value" }));
  });

  it("matches the CPU raster in value mode with values below the range", () => {
    parity([0, 10, 128, 255, 64], palette({ colorBy: "value" }, [50, 200]));
  });

  it("paints every value fully when the range has no magnitude", () => {
    // [0, 0] has nothing to ramp over; the raster paints any non-zero value
    // at full opacity, and so must the table.
    const lut = buildHeatmapLut([0, 0], palette());
    const { indices } = decodeHeatmapIndices(map([1, 9], 2), [0, 0]);

    expect(indices[0]).toBe(LAST);
    expect(indices[1]).toBe(LAST);
    expect(lutColor(lut, LAST)[3]).toBe(255);
  });

  it("ramps opacity when the range is a single non-zero value", () => {
    // start === stop has no gradient for value mode, so both paths fall back
    // to the opacity ramp over |value| / 5.
    parity([0, 1, 5, 9], palette({ colorBy: "value" }, [5, 5]));
  });
});
