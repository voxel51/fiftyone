/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { OverlayMask } from "@fiftyone/looker/src/numpy";
import type { ColorSchemeInput } from "@fiftyone/relay";
import { get32BitColor, hexToRgb } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";

import { resolveSegmentationPalette } from "./segmentationPalette";
import { rasterizeSegmentation } from "./segmentationRaster";

const POOL = ["#ff0000", "#00ff00", "#0000ff", "#ffff00"];
const PATH = "frames.segmentation";
const TARGETS = { 0: "background", 1: "sky", 2: "road" };

const scheme = (overrides: Partial<ColorSchemeInput> = {}): ColorSchemeInput =>
  ({
    colorPool: POOL,
    colorBy: "value",
    fields: [],
    ...overrides,
  }) as ColorSchemeInput;

const palette = (
  maskTargets: Record<number, string> | undefined = TARGETS,
  overrides: Partial<ColorSchemeInput> = {},
) => resolveSegmentationPalette(PATH, scheme(overrides), 7, maskTargets);

/** A decoded single-channel mask from a flat target array. */
const mask = (values: number[], width: number): OverlayMask =>
  ({
    channels: 1,
    arrayType: "Uint8Array",
    shape: [values.length / width, width],
    buffer: new Uint8Array(values).buffer,
  }) as unknown as OverlayMask;

describe("rasterizeSegmentation", () => {
  it("paints each target its palette color", () => {
    const { rgba, width, height } = rasterizeSegmentation(
      mask([1, 2, 1, 2], 2),
      palette(),
    );
    const pixels = new Uint32Array(rgba);

    expect(width).toBe(2);
    expect(height).toBe(2);
    expect(pixels[0]).toBe(pixels[2]);
    expect(pixels[1]).toBe(pixels[3]);
    expect(pixels[0]).not.toBe(pixels[1]);
  });

  it("leaves target 0 fully transparent", () => {
    // the background rule: a painted 0 would hide the media
    const { rgba } = rasterizeSegmentation(mask([0, 1, 0, 2], 2), palette());
    const pixels = new Uint32Array(rgba);

    expect(pixels[0]).toBe(0);
    expect(pixels[2]).toBe(0);
    expect(pixels[1]).not.toBe(0);
  });

  it("reports the target index per pixel for hit-testing", () => {
    const { targets } = rasterizeSegmentation(mask([0, 1, 2, 2], 2), palette());

    expect(Array.from(targets)).toEqual([0, 1, 2, 2]);
  });

  it("keeps the target channel and the pixels in agreement when filtering", () => {
    // a target outside a non-empty mask target map does not paint, and must
    // not hit-test either — otherwise the tooltip reports a label you cannot
    // see
    const { rgba, targets } = rasterizeSegmentation(
      mask([1, 9, 2, 9], 2),
      palette(TARGETS),
    );
    const pixels = new Uint32Array(rgba);

    expect(pixels[1]).toBe(0);
    expect(targets[1]).toBe(0);
    expect(pixels[3]).toBe(0);
    expect(targets[3]).toBe(0);
    expect(targets[0]).toBe(1);
  });

  it("paints unlisted targets when the mask target map is empty", () => {
    const { rgba, targets } = rasterizeSegmentation(
      mask([9, 9, 9, 9], 2),
      palette({}),
    );

    expect(new Uint32Array(rgba)[0]).not.toBe(0);
    expect(targets[0]).toBe(9);
  });

  it("paints the color the palette resolves, exactly", () => {
    const explicit = palette(TARGETS, {
      colorBy: "value",
      defaultMaskTargetsColors: [{ intTarget: 1, color: "#123456" }],
    } as Partial<ColorSchemeInput>);

    const { rgba } = rasterizeSegmentation(mask([1, 1, 1, 1], 2), explicit);

    // `get32BitColor` returns a signed int; a Uint32Array reads the same bits
    // unsigned, so normalize before comparing
    expect(new Uint32Array(rgba)[0]).toBe(
      get32BitColor(hexToRgb("#123456") as [number, number, number]) >>> 0,
    );
  });

  it("paints one color for the whole mask in field mode", () => {
    const { rgba } = rasterizeSegmentation(
      mask([1, 2, 1, 2], 2),
      palette(TARGETS, { colorBy: "field" }),
    );
    const pixels = new Uint32Array(rgba);

    expect(new Set(Array.from(pixels))).toEqual(new Set([pixels[0]]));
  });

  it("reports a target wider than a byte as itself", () => {
    // mask targets are not limited to 255 — a model with more classes than
    // that is ordinary, and narrowing would wrap 300 round to 44, naming the
    // wrong class in the tooltip and agreeing with itself in the hit test
    const wide = {
      channels: 1,
      arrayType: "Uint16Array",
      shape: [1, 2],
      buffer: new Uint16Array([300, 1]).buffer,
    } as unknown as OverlayMask;

    const { targets } = rasterizeSegmentation(wide, palette({}));

    expect(targets[0]).toBe(300);
  });

  it("rejects a multi-channel mask rather than misreading its channels", () => {
    // an RGB mask's channels are colors, not target indices; painting it
    // through this path would produce confident nonsense
    expect(() =>
      rasterizeSegmentation(
        {
          channels: 3,
          arrayType: "Uint8Array",
          shape: [1, 1],
          buffer: new Uint8Array([1, 2, 3]).buffer,
        } as unknown as OverlayMask,
        palette(),
      ),
    ).toThrow(/single-channel/);
  });

  it("paints a CSS color name rather than falling back to white", () => {
    // a mask-target color is whatever the user typed; "yellowgreen" is a
    // valid CSS color that `hexToRgb` alone reads as null, which used to
    // paint the whole target opaque white
    const named = palette(TARGETS, {
      colorBy: "value",
      defaultMaskTargetsColors: [{ intTarget: 1, color: "yellowgreen" }],
    } as Partial<ColorSchemeInput>);

    const { rgba } = rasterizeSegmentation(mask([1, 1, 1, 1], 2), named);

    expect(new Uint32Array(rgba)[0]).toBe(
      get32BitColor(hexToRgb("#9acd32") as [number, number, number]) >>> 0,
    );
  });

  it("rejects a mask with no area instead of failing at the canvas", () => {
    // `numpy.parse` copies the shape out of the header unchecked, and a
    // zero-length payload satisfies zero pixels — so this reaches
    // `createMaskCanvas` and `ImageData`, which throw with nothing to say
    expect(() =>
      rasterizeSegmentation(
        {
          channels: 1,
          arrayType: "Uint8Array",
          shape: [0, 0],
          buffer: new Uint8Array([]).buffer,
        } as unknown as OverlayMask,
        palette(),
      ),
    ).toThrow(/dimensions/);
  });

  it("rejects a shape that is not two dimensions", () => {
    expect(() =>
      rasterizeSegmentation(
        {
          channels: 1,
          arrayType: "Uint8Array",
          shape: [2, 2, 1],
          buffer: new Uint8Array([1, 2, 3, 4]).buffer,
        } as unknown as OverlayMask,
        palette(),
      ),
    ).toThrow(/2-D/);
  });

  it("rejects a payload whose length disagrees with its shape", () => {
    expect(() =>
      rasterizeSegmentation(
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
