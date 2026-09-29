/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { OverlayMask } from "@fiftyone/looker/src/numpy";
import type { ColorSchemeInput } from "@fiftyone/relay";
import { describe, expect, it } from "vitest";
import { INDEXED_LUT_SIDE } from "../renderer/Renderer2D";
import {
  buildSegmentationLut,
  decodeSegmentationIndices,
} from "./segmentationIndices";
import { resolveSegmentationPalette } from "./segmentationPalette";

const mask = (
  values: number[],
  shape: [number, number],
  arrayType = "Uint8Array",
  Ctor: new (values: number[]) => ArrayBufferView = Uint8Array,
): OverlayMask =>
  ({
    channels: 1,
    arrayType,
    shape,
    buffer: new Ctor(values).buffer,
  }) as unknown as OverlayMask;

const scheme = (overrides: Partial<ColorSchemeInput> = {}) =>
  ({
    colorPool: ["#ff0000", "#00ff00", "#0000ff"],
    colorBy: "value",
    fields: [],
    ...overrides,
  }) as ColorSchemeInput;

describe("decodeSegmentationIndices", () => {
  it("returns an 8-bit mask as a view over its own bytes", () => {
    const m = mask([0, 1, 2, 1], [2, 2]);
    const decoded = decodeSegmentationIndices(m);

    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    expect(decoded.indices).toBeInstanceOf(Uint8Array);
    expect(decoded.indices.buffer).toBe(m.buffer);
  });

  it("keeps a 16-bit mask's targets above 255", () => {
    const decoded = decodeSegmentationIndices(
      mask([0, 300, 1, 65535], [2, 2], "Uint16Array", Uint16Array),
    );

    expect(decoded.indices).toBeInstanceOf(Uint16Array);
    expect(Array.from(decoded.indices)).toEqual([0, 300, 1, 65535]);
  });

  it("narrows a signed or wide mask to Uint16, clamping to the table", () => {
    const decoded = decodeSegmentationIndices(
      mask([-5, 7, 70000, 0], [2, 2], "Int32Array", Int32Array),
    );

    expect(decoded.indices).toBeInstanceOf(Uint16Array);
    expect(Array.from(decoded.indices)).toEqual([0, 7, 65535, 0]);
  });

  it("rejects a multi-channel mask", () => {
    const m = { ...mask([0, 0, 0, 0], [1, 1]), channels: 4 } as OverlayMask;

    expect(() => decodeSegmentationIndices(m)).toThrow(/single-channel/);
  });
});

describe("buildSegmentationLut", () => {
  const targets = { 1: "a", 2: "b", 3: "c" };

  it("lays out RGBA for every target the palette paints, background clear", () => {
    const palette = resolveSegmentationPalette("seg", scheme(), 0, targets);
    const lut = buildSegmentationLut(new Uint8Array([0, 1, 2]), palette);

    expect(lut.length).toBe(INDEXED_LUT_SIDE * INDEXED_LUT_SIDE * 4);
    expect(lut[3]).toBe(0);
    for (const target of [1, 2, 3]) {
      expect(lut[target * 4 + 3]).toBe(255);
    }
    // target 4 is not in the mask targets, so it does not paint
    expect(lut[4 * 4 + 3]).toBe(0);
  });

  it("uses one color for every target when coloring by field", () => {
    const palette = resolveSegmentationPalette(
      "seg",
      scheme({ colorBy: "field" }),
      0,
      targets,
    );
    const lut = buildSegmentationLut(new Uint8Array([1, 2]), palette);

    expect(Array.from(lut.subarray(4, 7))).toEqual(
      Array.from(lut.subarray(8, 11)),
    );
  });

  it("fills a 16-bit mask's table for the targets present", () => {
    const palette = resolveSegmentationPalette("seg", scheme(), 0, {
      1: "low",
      300: "high",
    });
    const lut = buildSegmentationLut(new Uint16Array([0, 1, 300]), palette);

    expect(lut[1 * 4 + 3]).toBe(255);
    expect(lut[300 * 4 + 3]).toBe(255);
    expect(lut[2 * 4 + 3]).toBe(0);
  });
});
