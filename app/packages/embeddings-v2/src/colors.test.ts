import { PALETTE } from "./renderer";
import { describe, expect, it } from "vitest";
import { buildColors, MISSING_CATEGORY } from "./colors";

const rgbAt = (colors: Float32Array, i: number) => [
  colors[i * 3],
  colors[i * 3 + 1],
  colors[i * 3 + 2],
];

const hexToRgb = (hex: string) => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

describe("buildColors categorical", () => {
  it("maps class indices through the palette, cycling past its length", () => {
    const count = PALETTE.length + 1;
    const indices = new Uint16Array(count).map((_, i) => i);
    const colors = buildColors({ style: "categorical", indices });

    // Float32Array storage truncates the float64 palette math
    hexToRgb(PALETTE[0]).forEach((channel, c) => {
      expect(rgbAt(colors, 0)[c]).toBeCloseTo(channel, 6);
      // One past the palette wraps to the first entry
      expect(rgbAt(colors, PALETTE.length)[c]).toBeCloseTo(channel, 6);
    });
  });

  it("renders missing values gray", () => {
    const indices = new Uint16Array([0, MISSING_CATEGORY]);
    const colors = buildColors({ style: "categorical", indices });
    const [r, g, b] = rgbAt(colors, 1);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });
});

describe("buildColors continuous", () => {
  it("ramps between the endpoints across the range", () => {
    const values = new Float32Array([0, 10]);
    const colors = buildColors(
      { style: "continuous", values },
      { min: 0, max: 10 },
    );
    // Low end is bluer than the high end; high end is redder
    expect(rgbAt(colors, 0)[2]).toBeGreaterThan(rgbAt(colors, 1)[2]);
    expect(rgbAt(colors, 1)[0]).toBeGreaterThan(rgbAt(colors, 0)[0]);
  });

  it("clamps out-of-range values and grays NaN", () => {
    const range = { min: 0, max: 10 };
    const clamped = buildColors(
      { style: "continuous", values: new Float32Array([-100, 100, NaN]) },
      range,
    );
    const exact = buildColors(
      { style: "continuous", values: new Float32Array([0, 10]) },
      range,
    );
    expect(rgbAt(clamped, 0)).toEqual(rgbAt(exact, 0));
    expect(rgbAt(clamped, 1)).toEqual(rgbAt(exact, 1));
    const [r, g, b] = rgbAt(clamped, 2);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it("survives a degenerate range (min == max)", () => {
    const values = new Float32Array([5, 5]);
    const colors = buildColors(
      { style: "continuous", values },
      { min: 5, max: 5 },
    );
    expect(Number.isNaN(colors[0])).toBe(false);
  });
});
