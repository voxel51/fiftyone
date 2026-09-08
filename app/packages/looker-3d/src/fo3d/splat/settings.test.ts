import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPLAT_SETTINGS,
  getSplatLodScale,
  getSplatSortRadial,
  normalizeSplatSettings,
} from "./settings";

describe("normalizeSplatSettings", () => {
  it("uses performance-first defaults for missing data", () => {
    expect(DEFAULT_SPLAT_SETTINGS).toEqual({
      detail: "low",
      sharpness: 1,
      sorting: "stable",
      maxSh: 0,
    });
    expect(normalizeSplatSettings()).toEqual(DEFAULT_SPLAT_SETTINGS);
    expect(normalizeSplatSettings(null)).toEqual(DEFAULT_SPLAT_SETTINGS);
  });

  it("preserves valid preferences", () => {
    expect(
      normalizeSplatSettings({
        detail: "high",
        sharpness: 1.4,
        sorting: "accurate",
        maxSh: 2,
      }),
    ).toEqual({
      detail: "high",
      sharpness: 1.4,
      sorting: "accurate",
      maxSh: 2,
    });
  });

  it("repairs malformed preferences and clamps sharpness", () => {
    expect(
      normalizeSplatSettings({
        detail: "ultra",
        sharpness: 20,
        sorting: "random",
        maxSh: 9,
      }),
    ).toEqual({
      ...DEFAULT_SPLAT_SETTINGS,
      sharpness: 2,
    });
    expect(normalizeSplatSettings({ sharpness: -5 }).sharpness).toBe(0.5);
    expect(normalizeSplatSettings({ sharpness: Number.NaN }).sharpness).toBe(1);
  });
});

describe("Spark preference mappings", () => {
  it.each([
    ["low", 0.5],
    ["standard", 1],
    ["high", 2],
  ] as const)("maps %s detail to %s", (detail, expected) => {
    expect(getSplatLodScale(detail)).toBe(expected);
  });

  it("maps stable sorting to radial and accurate sorting to depth", () => {
    expect(getSplatSortRadial("stable")).toBe(true);
    expect(getSplatSortRadial("accurate")).toBe(false);
  });
});
