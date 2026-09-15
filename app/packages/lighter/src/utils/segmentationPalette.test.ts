/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Segmentation color rules, pinned against looker's worker painter. A mask
 * that paints one way in the grid and another in the modal is the failure
 * these guard, and it is one nobody can point at without a reference.
 */

import type { ColorSchemeInput } from "@fiftyone/relay";
import { getColor } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";

import {
  colorForTarget,
  paletteKey,
  resolveSegmentationPalette,
} from "./segmentationPalette";

const POOL = ["#ff0000", "#00ff00", "#0000ff", "#ffff00"];
const SEED = 7;
const PATH = "frames.segmentation";

const scheme = (overrides: Partial<ColorSchemeInput> = {}): ColorSchemeInput =>
  ({
    colorPool: POOL,
    colorBy: "field",
    fields: [],
    ...overrides,
  }) as ColorSchemeInput;

const TARGETS = { 0: "background", 1: "sky", 2: "road", 3: "tree" };

describe("resolveSegmentationPalette", () => {
  it("colors every target alike when coloring by field", () => {
    const palette = resolveSegmentationPalette(
      PATH,
      scheme({ colorBy: "field" }),
      SEED,
      TARGETS,
    );

    expect(palette.uniformColor).toBe(getColor(POOL, SEED, PATH));
    expect(colorForTarget(1, palette)).toBe(colorForTarget(2, palette));
  });

  it("colors per target when coloring by value", () => {
    const palette = resolveSegmentationPalette(
      PATH,
      scheme({ colorBy: "value" }),
      SEED,
      TARGETS,
    );

    expect(palette.uniformColor).toBeUndefined();
    expect(colorForTarget(1, palette)).not.toBe(colorForTarget(2, palette));
  });

  it("treats a single-target mask as field-colored even by value", () => {
    // looker's rule: one target carries no distinction worth coloring by
    const palette = resolveSegmentationPalette(
      PATH,
      scheme({ colorBy: "value" }),
      SEED,
      { 1: "only" },
    );

    expect(palette.uniformColor).toBeDefined();
  });

  it("indexes the fallback ramp by target % pool.length, as looker does", () => {
    // `getColor` hashes, so the wrapped index and the raw target give
    // DIFFERENT colors. Wrapping is what keeps this in step with the grid.
    const palette = resolveSegmentationPalette(
      PATH,
      scheme({ colorBy: "value" }),
      SEED,
      {},
    );

    const target = POOL.length + 2;

    expect(colorForTarget(target, palette)).toBe(
      getColor(POOL, SEED, target % POOL.length),
    );
    expect(colorForTarget(target, palette)).not.toBe(
      getColor(POOL, SEED, target),
    );
  });

  it("prefers field mask-target colors over the dataset defaults", () => {
    const palette = resolveSegmentationPalette(
      PATH,
      scheme({
        colorBy: "value",
        defaultMaskTargetsColors: [{ intTarget: 1, color: "#111111" }],
        fields: [
          {
            path: PATH,
            maskTargetsColors: [{ intTarget: 1, color: "#222222" }],
          },
        ],
      } as Partial<ColorSchemeInput>),
      SEED,
      TARGETS,
    );

    expect(colorForTarget(1, palette)).toBe("#222222");
  });

  it("falls back to the dataset default mask-target colors", () => {
    const palette = resolveSegmentationPalette(
      PATH,
      scheme({
        colorBy: "value",
        defaultMaskTargetsColors: [{ intTarget: 2, color: "#333333" }],
      } as Partial<ColorSchemeInput>),
      SEED,
      TARGETS,
    );

    expect(colorForTarget(2, palette)).toBe("#333333");
  });

  it("uses a field's custom color for the whole mask in field mode", () => {
    const palette = resolveSegmentationPalette(
      PATH,
      scheme({
        colorBy: "field",
        fields: [{ path: PATH, fieldColor: "#abcdef" }],
      } as Partial<ColorSchemeInput>),
      SEED,
      TARGETS,
    );

    expect(colorForTarget(3, palette)).toBe("#abcdef");
  });
});

describe("colorForTarget", () => {
  const palette = (targets: Record<number, string> | undefined) =>
    resolveSegmentationPalette(
      PATH,
      scheme({ colorBy: "value" }),
      SEED,
      targets,
    );

  it("never paints target 0", () => {
    // background. A mask that paints 0 covers the media entirely.
    expect(colorForTarget(0, palette(TARGETS))).toBeUndefined();
    expect(colorForTarget(0, palette({}))).toBeUndefined();
  });

  it("does not paint a target absent from a non-empty mask target map", () => {
    expect(colorForTarget(9, palette(TARGETS))).toBeUndefined();
  });

  it("paints any target when the mask target map is empty", () => {
    // empty means "no opinion", not "nothing is allowed"
    expect(colorForTarget(9, palette({}))).toBeDefined();
    expect(colorForTarget(9, palette(undefined))).toBeDefined();
  });
});

describe("paletteKey", () => {
  it("changes when the resolved colors change", () => {
    const byField = resolveSegmentationPalette(
      PATH,
      scheme({ colorBy: "field" }),
      SEED,
      TARGETS,
    );
    const byValue = resolveSegmentationPalette(
      PATH,
      scheme({ colorBy: "value" }),
      SEED,
      TARGETS,
    );

    expect(paletteKey(byField)).not.toBe(paletteKey(byValue));
  });

  it("is stable across equivalent resolutions", () => {
    const build = () =>
      resolveSegmentationPalette(
        PATH,
        scheme({ colorBy: "value" }),
        SEED,
        TARGETS,
      );

    expect(paletteKey(build())).toBe(paletteKey(build()));
  });
});
