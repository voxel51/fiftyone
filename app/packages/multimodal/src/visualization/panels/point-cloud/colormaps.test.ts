import { describe, expect, it } from "vitest";

import {
  createPointCloudColormapLookup,
  DEFAULT_POINT_CLOUD_COLORMAP,
  getGradientFromSchemeName,
  POINT_CLOUD_COLORMAPS,
  colormapCssGradient,
  normalizeColorStops,
  normalizePointCloudColormap,
  sampleColormap,
  writeColormapColor,
  writeColormapLookupColor,
} from "./colormaps";

describe("point-cloud colormaps", () => {
  it("keeps every sample of every colormap inside [0, 1]", () => {
    for (const colormap of POINT_CLOUD_COLORMAPS) {
      for (let step = 0; step <= 20; step++) {
        const [r, g, b] = sampleColormap(colormap, step / 20);
        for (const component of [r, g, b]) {
          expect(component).toBeGreaterThanOrEqual(0);
          expect(component).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("clamps out-of-range and non-finite inputs to the ramp ends", () => {
    for (const colormap of POINT_CLOUD_COLORMAPS) {
      expect(sampleColormap(colormap, -3)).toEqual(sampleColormap(colormap, 0));
      expect(sampleColormap(colormap, 42)).toEqual(sampleColormap(colormap, 1));
      expect(sampleColormap(colormap, Number.NaN)).toEqual(
        sampleColormap(colormap, 0),
      );
    }
  });

  it("preserves the default cool-warm ramp anchors", () => {
    // These are the historical height-ramp anchors; existing scenes keep
    // the same visual default while the implementation moves to stop lists.
    const [coolR, coolG, coolB] = sampleColormap("coolwarm", 0);
    expect(coolR).toBeCloseTo(0.25);
    expect(coolG).toBeCloseTo(0.55);
    expect(coolB).toBeCloseTo(1);

    const [midR, midG, midB] = sampleColormap("coolwarm", 0.5);
    expect(midR).toBeCloseTo(0.25);
    expect(midG).toBeCloseTo(0.9);
    expect(midB).toBeCloseTo(1);

    const [warmR, warmG, warmB] = sampleColormap("coolwarm", 1);
    expect(warmR).toBeCloseTo(1);
    expect(warmG).toBeCloseTo(0.9);
    expect(warmB).toBeCloseTo(0.52);
  });

  it("orients the perceptual ramps dark-to-bright ends correctly", () => {
    // Turbo runs blue → red; viridis runs purple → yellow. Sampled just
    // inside the ends: the quintic turbo fit is loosest at exactly 0/1.
    const [turboLowR, , turboLowB] = sampleColormap("turbo", 0.1);
    const [turboHighR, , turboHighB] = sampleColormap("turbo", 0.9);
    expect(turboLowB).toBeGreaterThan(turboLowR);
    expect(turboHighR).toBeGreaterThan(turboHighB);

    const [viridisLowR, viridisLowG] = sampleColormap("viridis", 0);
    const [viridisHighR, viridisHighG] = sampleColormap("viridis", 1);
    expect(viridisLowG).toBeLessThan(0.2);
    expect(viridisLowR).toBeLessThan(0.5);
    expect(viridisHighR).toBeGreaterThan(0.8);
    expect(viridisHighG).toBeGreaterThan(0.8);

    const [grayLow] = sampleColormap("grayscale", 0);
    const [grayHigh] = sampleColormap("grayscale", 1);
    expect(grayHigh).toBeGreaterThan(grayLow);
  });

  it("writes colors in place at the requested offset", () => {
    const target = new Float32Array(9);
    writeColormapColor(target, 3, "grayscale", 1);
    expect(target[0]).toBe(0);
    expect(target[3]).toBeGreaterThan(0.9);
    expect(target[4]).toBe(target[3]);
    expect(target[5]).toBe(target[3]);
    expect(target[6]).toBe(0);
  });

  it("generates looker-style scheme-name gradients", () => {
    const gradient = getGradientFromSchemeName("viridis", 10);

    expect(gradient).toHaveLength(10);
    expect(gradient[0]).toEqual({ color: "#440154", value: 0 });
    expect(gradient[9]).toMatchObject({ value: 1 });
    expect(gradient[2].color).toBe("#3b518b");
  });

  it("supports explicit looker-style fallback maps", () => {
    expect(getGradientFromSchemeName("CyanToYellow")[0].color).toBe("#00ffff");
    expect(getGradientFromSchemeName("not-real")[0].color).toBe("#408cff");
  });

  it("normalizes custom color stops", () => {
    expect(
      normalizePointCloudColormap({
        list: [
          { value: 1, color: "#FFFFFF" },
          { value: Number.NaN, color: "#000000" },
          { value: -1, color: "000000" },
        ],
        name: " Custom ",
      }),
    ).toEqual({
      list: [
        { color: "#000000", value: 0 },
        { color: "#ffffff", value: 1 },
      ],
      name: "Custom",
    });
    expect(normalizeColorStops([{ value: 0, color: "oops" }])).toBeNull();
  });

  it("samples custom stop lists and lookup tables", () => {
    const custom = {
      list: [
        { value: 0, color: "#000000" },
        { value: 1, color: "#ffffff" },
      ],
    };
    const [r, g, b] = sampleColormap(custom, 0.5);
    expect(r).toBeCloseTo(0.5, 1);
    expect(g).toBeCloseTo(0.5, 1);
    expect(b).toBeCloseTo(0.5, 1);

    const lookup = createPointCloudColormapLookup(custom, 4);
    const target = new Float32Array(3);
    writeColormapLookupColor(target, 0, lookup, 1);
    expect(Array.from(target)).toEqual([1, 1, 1]);
  });

  it("renders css gradients spanning the full ramp", () => {
    for (const colormap of POINT_CLOUD_COLORMAPS) {
      const gradient = colormapCssGradient(colormap);
      expect(gradient).toMatch(/^linear-gradient\(90deg, #[0-9a-f]{6}/);
      expect(gradient).toContain(" 0%");
      expect(gradient).toContain(" 100%");
    }
  });

  it("normalizes unknown colormap ids to the default", () => {
    expect(normalizePointCloudColormap("turbo")).toBe("turbo");
    expect(normalizePointCloudColormap("Cyan To Yellow")).toBe("cyantoyellow");
    expect(normalizePointCloudColormap("plaid")).toBe(
      DEFAULT_POINT_CLOUD_COLORMAP,
    );
    expect(normalizePointCloudColormap(undefined)).toBe(
      DEFAULT_POINT_CLOUD_COLORMAP,
    );
  });
});
