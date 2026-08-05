import { describe, expect, it } from "vitest";
import {
  buildColors,
  categoryCss,
  MISSING_CATEGORY,
  resolvePalette,
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
const pooled = () => POOL[0];

const meta = (labels: (string | number | boolean)[]) =>
  ({
    style: "categorical",
    classes: labels.map((label) => ({ label, count: 1 })),
  }) as const;

describe("resolvePalette", () => {
  it("colors values with the App's seeded pool generator", () => {
    // The grid hashes label values through this same generator, so a
    // value must land on whatever color that generator gives it
    const colorMap = (value: string) => POOL[["cat", "dog"].indexOf(value)];

    expect(
      resolvePalette("ground_truth.label", meta(["cat", "dog"]), colorMap),
    ).toEqual([POOL[0], POOL[1]]);
  });

  it("prefers a label field's override for the attribute it colors by", () => {
    expect(
      resolvePalette("ground_truth.label", meta(["cat", "dog"]), pooled, [
        {
          path: "ground_truth",
          valueColors: [{ value: "cat", color: "#123456" }],
        },
      ]),
    ).toEqual(["#123456", POOL[0]]);
  });

  it("ignores overrides scoped to a different attribute", () => {
    expect(
      resolvePalette("ground_truth.label", meta(["cat"]), pooled, [
        {
          path: "ground_truth",
          colorByAttribute: "eval",
          valueColors: [{ value: "cat", color: "#123456" }],
        },
      ]),
    ).toEqual([POOL[0]]);
  });

  it("takes a primitive field's own overrides", () => {
    expect(
      resolvePalette("split", meta(["train"]), pooled, [
        { path: "split", valueColors: [{ value: "train", color: "#abcdef" }] },
      ]),
    ).toEqual(["#abcdef"]);
  });

  it("falls back to the pool for a color the renderer cannot parse", () => {
    expect(
      resolvePalette("split", meta(["train"]), pooled, [
        { path: "split", valueColors: [{ value: "train", color: "nonsense" }] },
      ]),
    ).toEqual([POOL[0]]);
  });

  it("matches non-string labels against overrides by value", () => {
    expect(
      resolvePalette("is_cloudy", meta([true, 3]), pooled, [
        {
          path: "is_cloudy",
          valueColors: [
            { value: "true", color: "#111111" },
            { value: "3", color: "#222222" },
          ],
        },
      ]),
    ).toEqual(["#111111", "#222222"]);
  });

  it("has no classes for a continuous field", () => {
    expect(
      resolvePalette("uniqueness", { style: "continuous" }, pooled),
    ).toEqual([]);
  });
});

describe("buildColors categorical", () => {
  it("gives legend swatches the exact color the points get", () => {
    // The drift guard: categoryCss (legend) and buildColors (points)
    // must agree for every palette index
    const indices = new Uint16Array(POOL.length).map((_, i) => i);
    const colors = buildColors({ style: "categorical", indices }, POOL);

    for (let i = 0; i < POOL.length; i++) {
      hexToRgb(categoryCss(POOL, i)).forEach((channel, c) => {
        expect(rgbAt(colors, i)[c]).toBeCloseTo(channel, 6);
      });
    }
  });

  it("renders missing values gray", () => {
    const indices = new Uint16Array([0, MISSING_CATEGORY]);
    const colors = buildColors({ style: "categorical", indices }, POOL);
    const [r, g, b] = rgbAt(colors, 1);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });
});

describe("buildColors continuous", () => {
  it("ramps between the endpoints across the range", () => {
    const values = new Float32Array([0, 10]);
    const colors = buildColors({ style: "continuous", values }, [], {
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
      [],
      range,
    );
    const exact = buildColors(
      { style: "continuous", values: new Float32Array([0, 10]) },
      [],
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
    const colors = buildColors({ style: "continuous", values }, [], {
      min: 5,
      max: 5,
    });
    expect(Number.isNaN(colors[0])).toBe(false);
  });
});
