/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Heatmap paint rules, pinned against looker's worker painter and the
 * semantics the original Heatmap PR (#1229) describes.
 */

import type { OverlayMask } from "@fiftyone/looker/src/numpy";
import type { ColorSchemeInput } from "@fiftyone/relay";
import { describe, expect, it } from "vitest";

import { resolveHeatmapPalette } from "./heatmapPalette";
import { rasterizeHeatmap } from "./heatmapRaster";

const POOL = ["#ff0000", "#00ff00"];
const PATH = "frames.heatmap";
const SCALE = [
  [0, 0, 0],
  [128, 128, 128],
  [255, 255, 255],
];

const scheme = (overrides: Partial<ColorSchemeInput> = {}): ColorSchemeInput =>
  ({
    colorPool: POOL,
    colorBy: "field",
    fields: [],
    defaultColorscale: { name: "viridis", list: null, rgb: SCALE },
    colorscales: [],
    ...overrides,
  }) as unknown as ColorSchemeInput;

const palette = (
  range: number[] | null = null,
  overrides: Partial<ColorSchemeInput> = {},
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

/** Alpha byte of a packed RGBA pixel. */
const alphaOf = (pixel: number) => (pixel >>> 24) & 0xff;

describe("rasterizeHeatmap — range inference", () => {
  it("assumes [0, 1] for a float map with no declared range", () => {
    const { range } = rasterizeHeatmap(map([0.5, 1, 0.25, 0], 2), palette());

    expect(range).toEqual([0, 1]);
  });

  it("assumes [0, 255] for an integer map with no declared range", () => {
    const { range } = rasterizeHeatmap(
      map([10, 200, 30, 0], 2, Uint8Array),
      palette(),
    );

    expect(range).toEqual([0, 255]);
  });

  it("uses the declared range when the label has one", () => {
    const { range } = rasterizeHeatmap(
      map([10, -20, 30, 0], 2),
      palette([-50, 100]),
    );

    expect(range).toEqual([-50, 100]);
  });
});

describe("rasterizeHeatmap — coloring by field", () => {
  it("ramps opacity with distance from zero", () => {
    const { rgba } = rasterizeHeatmap(map([0.25, 0.5, 1, 0.75], 2), palette());
    const pixels = new Uint32Array(rgba);

    expect(alphaOf(pixels[0])).toBeLessThan(alphaOf(pixels[1]));
    expect(alphaOf(pixels[1])).toBeLessThan(alphaOf(pixels[2]));
    expect(alphaOf(pixels[2])).toBe(255);
  });

  it("renders an asymmetric range as PR #1229 describes", () => {
    // range [-50, 100]: 0 fully transparent, -50 half opaque, 100 fully opaque.
    // Opacity tracks |value| / max, NOT position within the range — which is
    // the whole point of allowing a negative end.
    const { rgba } = rasterizeHeatmap(
      map([0, -50, 100, -25], 2),
      palette([-50, 100]),
    );
    const pixels = new Uint32Array(rgba);

    expect(pixels[0]).toBe(0);
    expect(alphaOf(pixels[1])).toBeCloseTo(255 * 0.5, -1);
    expect(alphaOf(pixels[2])).toBe(255);
    expect(alphaOf(pixels[3])).toBeCloseTo(255 * 0.25, -1);
  });

  it("colors negative and positive alike, differing only in opacity", () => {
    const { rgba } = rasterizeHeatmap(
      map([-50, 50, 0, 0], 2),
      palette([-50, 100]),
    );
    const pixels = new Uint32Array(rgba);

    // same RGB, different alpha
    expect(pixels[0] & 0x00ffffff).toBe(pixels[1] & 0x00ffffff);
  });

  it("uses a field's custom color", () => {
    const withColor = palette(null, {
      fields: [{ path: PATH, fieldColor: "#123456" }],
    } as Partial<ColorSchemeInput>);

    expect(withColor.fieldColor).toBe("#123456");
  });
});

describe("rasterizeHeatmap — coloring by value", () => {
  const byValue = (range: number[] | null = null) =>
    palette(range, { colorBy: "value" });

  it("indexes the colorscale across the range", () => {
    const { rgba } = rasterizeHeatmap(map([0.01, 0.5, 1, 0.99], 2), byValue());
    const pixels = new Uint32Array(rgba);

    // low and high ends land on different stops
    expect(pixels[0]).not.toBe(pixels[2]);
    expect(alphaOf(pixels[2])).toBe(255);
  });

  it("treats values below the range start as background", () => {
    const { rgba } = rasterizeHeatmap(
      map([-10, 50, 100, 25], 2),
      byValue([0, 100]),
    );

    expect(new Uint32Array(rgba)[0]).toBe(0);
  });

  it("falls back to field coloring when no scale resolves", () => {
    // painting nothing would just look broken; an opacity ramp still reads
    const noScale = resolveHeatmapPalette(
      PATH,
      {
        colorPool: POOL,
        colorBy: "value",
        fields: [],
        colorscales: [],
        defaultColorscale: null,
      } as unknown as ColorSchemeInput,
      7,
      null,
    );

    expect(noScale.mode).toBe("field");
    expect(
      new Uint32Array(rasterizeHeatmap(map([1, 1, 1, 1], 2), noScale).rgba)[0],
    ).not.toBe(0);
  });

  it("colors by value from the app config colormap when the scheme has none", () => {
    // A dataset with no SAVED color scheme has neither a per-field nor a
    // default colorscale with `rgb` — that field is resolved server-side for
    // a stored scheme only. Without the config colormap as the last
    // fallback, the common case silently rendered as field mode while the
    // sidebar said color by value. Looker's chain ends at `coloring.scale`.
    const configScale = [
      [68, 1, 84],
      [253, 231, 37],
    ];

    const resolved = resolveHeatmapPalette(
      PATH,
      {
        colorPool: POOL,
        colorBy: "value",
        fields: [],
        colorscales: [],
        defaultColorscale: { name: "viridis", list: null },
      } as unknown as ColorSchemeInput,
      7,
      null,
      configScale as never,
    );

    expect(resolved.mode).toBe("value");
    expect(resolved.scale).toEqual(configScale);
  });

  it("prefers a stored colorscale over the app config colormap", () => {
    const fieldScale = [[1, 2, 3]];

    const resolved = resolveHeatmapPalette(
      PATH,
      scheme({
        colorBy: "value",
        colorscales: [{ path: PATH, name: "rdbu", rgb: fieldScale }],
      } as unknown as Partial<ColorSchemeInput>),
      7,
      null,
      [[9, 9, 9]] as never,
    );

    expect(resolved.scale).toEqual(fieldScale);
  });

  it("prefers a field's own colorscale over the default", () => {
    const fieldScale = [[1, 2, 3]];
    const resolved = resolveHeatmapPalette(
      PATH,
      scheme({
        colorBy: "value",
        colorscales: [{ path: PATH, name: "rdbu", rgb: fieldScale }],
      } as unknown as Partial<ColorSchemeInput>),
      7,
      null,
    );

    expect(resolved.scale).toEqual(fieldScale);
  });
});

describe("rasterizeHeatmap — shared rules", () => {
  it("treats 0 as background in both modes", () => {
    for (const p of [palette(), palette(null, { colorBy: "value" })]) {
      const { rgba } = rasterizeHeatmap(map([0, 0.5, 0, 1], 2), p);
      const pixels = new Uint32Array(rgba);

      expect(pixels[0]).toBe(0);
      expect(pixels[2]).toBe(0);
    }
  });

  it("treats a non-finite value as background in both modes", () => {
    // A float32 map out of a model can carry NaN or Infinity. In value mode
    // `clampedIndex` returns NaN, which is not `< 0`, so it would index the
    // scale with NaN and hand `get32BitColor` an undefined stop to
    // destructure — taking the whole raster down. In field mode it would be
    // passed straight through as the opacity.
    for (const p of [palette(), palette(null, { colorBy: "value" })]) {
      const { rgba } = rasterizeHeatmap(
        map([Number.NaN, 0.5, Number.POSITIVE_INFINITY, 1], 2),
        p,
      );
      const pixels = new Uint32Array(rgba);

      expect(pixels[0]).toBe(0);
      expect(pixels[2]).toBe(0);
      // the finite neighbours still paint
      expect(pixels[1]).not.toBe(0);
      expect(pixels[3]).not.toBe(0);
    }
  });

  it("reports the value under each pixel for the tooltip", () => {
    const { values } = rasterizeHeatmap(map([0, 0.5, 0.25, 1], 2), palette());

    expect(Array.from(values)).toEqual([0, 0.5, 0.25, 1]);
  });

  it("survives a degenerate range instead of painting nothing", () => {
    // `clampedIndex` divides by `stop - start`; a single-value range would
    // make every index NaN. There is no gradient to express, so the opacity
    // ramp still shows where the data is.
    const { rgba } = rasterizeHeatmap(
      map([5, 5, 5, 5], 2),
      palette([5, 5], { colorBy: "value" }),
    );

    expect(new Uint32Array(rgba)[0]).not.toBe(0);
  });

  it("survives an inverted range", () => {
    const { rgba } = rasterizeHeatmap(
      map([5, 5, 5, 5], 2),
      palette([10, 0], { colorBy: "value" }),
    );

    expect(Number.isFinite(new Uint32Array(rgba)[0])).toBe(true);
  });

  it("reads channel 0 of a multi-channel map, as the painter does", () => {
    // looker has read channel 0 of an RGB heatmap since #2880; the value is
    // scalar, so the other channels carry nothing to render
    const { values } = rasterizeHeatmap(
      {
        channels: 3,
        arrayType: "Uint8Array",
        shape: [1, 2],
        // channel 0 is [10, 200]; 9s in the channels that must be skipped
        buffer: new Uint8Array([10, 9, 9, 200, 9, 9]).buffer,
      } as unknown as OverlayMask,
      palette(),
    );

    expect(Array.from(values)).toEqual([10, 200]);
  });

  it("rejects a multi-channel payload of the wrong length", () => {
    // the length check has to account for the stride, or a short RGB buffer
    // reads past its end
    expect(() =>
      rasterizeHeatmap(
        {
          channels: 3,
          arrayType: "Uint8Array",
          shape: [1, 2],
          buffer: new Uint8Array([1, 2, 3]).buffer,
        } as unknown as OverlayMask,
        palette(),
      ),
    ).toThrow(/length mismatch/);
  });

  it("rejects a payload whose length disagrees with its shape", () => {
    expect(() =>
      rasterizeHeatmap(
        {
          channels: 1,
          arrayType: "Uint8Array",
          shape: [4, 4],
          buffer: new Uint8Array([1, 2]).buffer,
        } as unknown as OverlayMask,
        palette(),
      ),
    ).toThrow(/length mismatch/);
  });
});
