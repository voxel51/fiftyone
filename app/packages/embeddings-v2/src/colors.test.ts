import { PALETTE } from "./renderer";
import { describe, expect, it } from "vitest";
import {
  buildColors,
  categoryHex,
  isRampId,
  MISSING_CATEGORY,
  rampCss,
  rampDomain,
  rampGradient,
  RAMPS,
} from "./colors";

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
  it("gives legend swatches the exact color the points get", () => {
    // The drift guard: categoryHex (legend) and buildColors (points)
    // must agree for every class index, including past the palette wrap
    const count = PALETTE.length + 2;
    const indices = new Uint16Array(count).map((_, i) => i);
    const colors = buildColors({ style: "categorical", indices });

    for (let i = 0; i < count; i++) {
      hexToRgb(categoryHex(i)).forEach((channel, c) => {
        expect(rgbAt(colors, i)[c]).toBeCloseTo(channel, 6);
      });
    }
  });

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

describe("buildColors ramp selection", () => {
  it("maps the same value through whichever ramp is named", () => {
    const column = {
      style: "continuous" as const,
      values: new Float32Array([0.5]),
    };
    const range = { min: 0, max: 1 };
    const viridis = rgbAt(buildColors(column, range, "viridis"), 0);

    // The ramp's own middle stop, so the ramp is what was read — not merely
    // "some other numbers than the default"
    RAMPS.viridis.stops[2].forEach((channel, c) => {
      expect(viridis[c]).toBeCloseTo(channel, 6);
    });
    expect(viridis).not.toEqual(rgbAt(buildColors(column, range), 0));
  });

  it("leaves categorical classes on the palette whatever the ramp", () => {
    const indices = new Uint16Array([0, 1]);
    expect([
      ...buildColors({ style: "categorical", indices }, undefined, "viridis"),
    ]).toEqual([...buildColors({ style: "categorical", indices })]);
  });

  it("puts zero on the diverging ramp's middle stop, asymmetric data or not", () => {
    // Twice as much headroom above zero as below: an unanchored ramp would
    // land zero a third of the way along and read as a direction
    const colors = buildColors(
      { style: "continuous", values: new Float32Array([0]) },
      { min: -5, max: 10 },
      "coolWarm",
    );
    RAMPS.coolWarm.stops[1].forEach((channel, c) => {
      expect(rgbAt(colors, 0)[c]).toBeCloseTo(channel, 6);
    });
  });

  it("reports the values a ramp's ends stand for", () => {
    // Non-diverging ramps span the data; a diverging one is symmetric, so its
    // low end is past the data's minimum
    expect(rampDomain(-5, 10, RAMPS.viridis)).toEqual([-5, 10]);
    expect(rampDomain(-5, 10, RAMPS.coolWarm)).toEqual([-10, 10]);
    // All one sign: nothing to center on, so no widening
    expect(rampDomain(2, 10, RAMPS.coolWarm)).toEqual([2, 10]);
  });
});

describe("rampGradient", () => {
  it("carries every stop, and its ends are the colors the points get", () => {
    const gradient = rampGradient("viridis");
    // One CSS stop per ramp stop: sampling only the ends would flatten the
    // very ramp that was chosen for its middle
    expect(gradient.match(/rgb\(/g)?.length).toBe(RAMPS.viridis.stops.length);

    const colors = buildColors(
      { style: "continuous", values: new Float32Array([0, 1]) },
      { min: 0, max: 1 },
      "viridis",
    );
    const css = (i: number) =>
      `rgb(${rgbAt(colors, i)
        .map((channel) => Math.round(channel * 255))
        .join(", ")})`;
    expect(gradient).toContain(css(0));
    expect(gradient).toContain(css(1));
    expect(rampCss(0, "viridis")).toBe(css(0));
  });
});

describe("every ramp against the canvas", () => {
  /** Relative luminance, the Rec. 709 weights VOODO's own contrast checks use */
  const luma = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  it("keeps every stop off the dark theme's background", () => {
    // The chart clears transparent, so points are drawn straight onto the page
    // — a near-black stop is not a dim color, it is a missing end of the range
    Object.entries(RAMPS).forEach(([id, ramp]) => {
      ramp.stops.forEach((stop, i) => {
        expect(
          luma(stop),
          `${id} stop ${i} disappears on a dark canvas`,
        ).toBeGreaterThan(0.15);
      });
    });
  });

  it("interpolates without dipping below its stops", () => {
    // A ramp is only as visible as its darkest POINT, and rgb interpolation
    // between two visible stops can still pass through a darker blend
    Object.keys(RAMPS).forEach((id) => {
      for (let t = 0; t <= 1; t += 1 / 64) {
        const rgb = rgbAt(
          buildColors(
            { style: "continuous", values: new Float32Array([t]) },
            { min: 0, max: 1 },
            id as keyof typeof RAMPS,
          ),
          0,
        );
        expect(luma(rgb)).toBeGreaterThan(0.15);
      }
    });
  });
});

describe("isRampId", () => {
  it("accepts a known ramp and rejects stale or malformed panel state", () => {
    expect(isRampId("viridis")).toBe(true);
    // Panel state outlives a build: a dropped ramp must not index RAMPS
    expect(isRampId("magma")).toBe(false);
    expect(isRampId(null)).toBe(false);
    expect(isRampId(0)).toBe(false);
  });
});
