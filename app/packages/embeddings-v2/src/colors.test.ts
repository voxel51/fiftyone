import { describe, expect, it } from "vitest";
import {
  buildColors,
  categoryCss,
  MISSING_CATEGORY,
  resolvePalette,
  type PlotPalette,
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

const POOL = ["#ff0000", "#00ff00", "#0000ff"];
const palette = (classes: string[]): PlotPalette => ({
  classes,
  ramp: [
    [38, 102, 230],
    [255, 166, 0],
  ],
});

const classesOf = (labels: (string | number | boolean)[]) =>
  labels.map((label) => ({ label, count: 1 }));

describe("resolvePalette", () => {
  it("colors classes with the App's seeded pool generator", () => {
    // The grid hashes label values through this same generator, so a
    // class must land on whatever color that generator gives its value
    const colorMap = (value: string) =>
      POOL[["cat", "dog"].indexOf(value) % POOL.length];
    const resolved = resolvePalette({
      field: "ground_truth.label",
      meta: { style: "categorical", classes: classesOf(["cat", "dog"]) },
      colorMap,
    });

    expect(resolved.classes).toEqual([POOL[0], POOL[1]]);
  });

  it("prefers a label field's per-value override for the attribute it colors by", () => {
    const resolved = resolvePalette({
      field: "ground_truth.label",
      meta: { style: "categorical", classes: classesOf(["cat", "dog"]) },
      colorMap: () => POOL[0],
      fields: [
        {
          path: "ground_truth",
          valueColors: [{ value: "cat", color: "#123456" }],
        },
      ],
    });

    expect(resolved.classes).toEqual(["#123456", POOL[0]]);
  });

  it("ignores overrides scoped to a different attribute", () => {
    const resolved = resolvePalette({
      field: "ground_truth.label",
      meta: { style: "categorical", classes: classesOf(["cat"]) },
      colorMap: () => POOL[0],
      fields: [
        {
          path: "ground_truth",
          colorByAttribute: "eval",
          valueColors: [{ value: "cat", color: "#123456" }],
        },
      ],
    });

    expect(resolved.classes).toEqual([POOL[0]]);
  });

  it("takes a primitive field's own overrides", () => {
    const resolved = resolvePalette({
      field: "split",
      meta: { style: "categorical", classes: classesOf(["train"]) },
      colorMap: () => POOL[0],
      fields: [
        { path: "split", valueColors: [{ value: "train", color: "#abcdef" }] },
      ],
    });

    expect(resolved.classes).toEqual(["#abcdef"]);
  });

  it("falls back to the pool for a color the renderer cannot parse", () => {
    const resolved = resolvePalette({
      field: "split",
      meta: { style: "categorical", classes: classesOf(["train"]) },
      colorMap: () => POOL[0],
      fields: [
        { path: "split", valueColors: [{ value: "train", color: "nonsense" }] },
      ],
    });

    expect(resolved.classes).toEqual([POOL[0]]);
  });

  it("matches non-string class labels against overrides by value", () => {
    const resolved = resolvePalette({
      field: "is_cloudy",
      meta: { style: "categorical", classes: classesOf([true, 3]) },
      colorMap: () => POOL[0],
      fields: [
        {
          path: "is_cloudy",
          valueColors: [
            { value: "true", color: "#111111" },
            { value: "3", color: "#222222" },
          ],
        },
      ],
    });

    expect(resolved.classes).toEqual(["#111111", "#222222"]);
  });

  it("prefers the field's colorscale, then the default, then the config", () => {
    const args = {
      field: "uniqueness",
      meta: { style: "continuous" as const },
      colorMap: () => POOL[0],
      colorscales: [
        { path: "uniqueness", rgb: [[1, 1, 1]] as [number, number, number][] },
      ],
      defaultColorscale: { rgb: [[2, 2, 2]] as [number, number, number][] },
      configColorscale: [[3, 3, 3]] as [number, number, number][],
    };

    expect(resolvePalette(args).ramp).toEqual([[1, 1, 1]]);
    expect(resolvePalette({ ...args, colorscales: [] }).ramp).toEqual([
      [2, 2, 2],
    ]);
    expect(
      resolvePalette({ ...args, colorscales: [], defaultColorscale: null })
        .ramp,
    ).toEqual([[3, 3, 3]]);
  });
});

describe("buildColors categorical", () => {
  it("gives legend swatches the exact color the points get", () => {
    // The drift guard: categoryCss (legend) and buildColors (points)
    // must agree for every class index
    const scheme = palette(POOL);
    const indices = new Uint16Array(POOL.length).map((_, i) => i);
    const colors = buildColors({ style: "categorical", indices }, scheme);

    for (let i = 0; i < POOL.length; i++) {
      hexToRgb(categoryCss(scheme, i)).forEach((channel, c) => {
        expect(rgbAt(colors, i)[c]).toBeCloseTo(channel, 6);
      });
    }
  });

  it("renders missing values gray", () => {
    const indices = new Uint16Array([0, MISSING_CATEGORY]);
    const colors = buildColors(
      { style: "categorical", indices },
      palette(POOL),
    );
    const [r, g, b] = rgbAt(colors, 1);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });
});

describe("buildColors continuous", () => {
  const scheme = palette([]);

  it("ramps between the endpoints across the range", () => {
    const values = new Float32Array([0, 10]);
    const colors = buildColors({ style: "continuous", values }, scheme, {
      min: 0,
      max: 10,
    });
    // Low end is bluer than the high end; high end is redder
    expect(rgbAt(colors, 0)[2]).toBeGreaterThan(rgbAt(colors, 1)[2]);
    expect(rgbAt(colors, 1)[0]).toBeGreaterThan(rgbAt(colors, 0)[0]);
  });

  it("clamps out-of-range values and grays NaN", () => {
    const range = { min: 0, max: 10 };
    const clamped = buildColors(
      { style: "continuous", values: new Float32Array([-100, 100, NaN]) },
      scheme,
      range,
    );
    const exact = buildColors(
      { style: "continuous", values: new Float32Array([0, 10]) },
      scheme,
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
    const colors = buildColors({ style: "continuous", values }, scheme, {
      min: 5,
      max: 5,
    });
    expect(Number.isNaN(colors[0])).toBe(false);
  });

  it("ramps through a multi-stop colorscale", () => {
    // A real colorscale is 256 stops; the middle of a 3-stop ramp must
    // land on the middle stop, not interpolate the endpoints
    const scale: PlotPalette = {
      classes: [],
      ramp: [
        [0, 0, 0],
        [0, 255, 0],
        [255, 255, 255],
      ],
    };
    const colors = buildColors(
      { style: "continuous", values: new Float32Array([0.5]) },
      scale,
      { min: 0, max: 1 },
    );
    expect(rgbAt(colors, 0)[1]).toBeCloseTo(1, 2);
    expect(rgbAt(colors, 0)[0]).toBeLessThan(0.05);
  });
});
