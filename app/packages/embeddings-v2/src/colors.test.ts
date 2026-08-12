import { describe, expect, it } from "vitest";
import {
  buildColors,
  categoryCss,
  MISSING_CATEGORY,
  rampCss,
  resolveColorscale,
  resolvePalette,
  type Colorscale,
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

  it("finds a label field's override through a list label's extra segment", () => {
    // Patches plots color by a path under the label list root
    // (ground_truth.detections.label) while the scheme stores the
    // setting at the list field itself (ground_truth) — one strip lands
    // on "ground_truth.detections", which never matches
    expect(
      resolvePalette(
        "ground_truth.detections.label",
        meta(["cat", "dog"]),
        pooled,
        [
          {
            path: "ground_truth",
            valueColors: [{ value: "cat", color: "#123456" }],
          },
        ],
      ),
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

  it("accepts a named CSS color as an override", () => {
    // Named colors never parse as hex/rgb()/hsl() — without a name lookup
    // this silently fell back to the pool instead of honoring the override.
    // The palette keeps the original string (like any other valid override);
    // buildColors resolves it to RGB the same way it resolves hex entries
    expect(
      resolvePalette("split", meta(["train"]), pooled, [
        { path: "split", valueColors: [{ value: "train", color: "red" }] },
      ]),
    ).toEqual(["red"]);
  });

  it("matches a named color case-insensitively", () => {
    expect(
      resolvePalette("split", meta(["train"]), pooled, [
        { path: "split", valueColors: [{ value: "train", color: "Red" }] },
      ]),
    ).toEqual(["Red"]);
  });
});

describe("resolveColorscale", () => {
  // The server/app config wire format: 0-255 integer per channel, matching
  // the same convention the grid's own heatmap overlays consume via
  // get32BitColor (no /255 there either) — resolveColorscale normalizes
  // this down to the 0-1 floats the rest of this file works in
  const FIELD_SCALE_255 = [[10, 10, 10]];
  const DEFAULT_SCALE_255 = [[20, 20, 20]];
  const normalized = (rgb255: number[][]): Colorscale =>
    rgb255.map(([r, g, b]) => [r / 255, g / 255, b / 255]);

  it("prefers a field-specific colorscale from the scheme", () => {
    expect(
      resolveColorscale(
        "uniqueness",
        [{ path: "uniqueness", rgb: FIELD_SCALE_255 }],
        { rgb: DEFAULT_SCALE_255 },
      ),
    ).toEqual(normalized(FIELD_SCALE_255));
  });

  it("falls back to the scheme's default colorscale", () => {
    expect(
      resolveColorscale(
        "uniqueness",
        [{ path: "other_field", rgb: FIELD_SCALE_255 }],
        { rgb: DEFAULT_SCALE_255 },
      ),
    ).toEqual(normalized(DEFAULT_SCALE_255));
  });

  it("falls back to the built-in ramp when nothing resolves", () => {
    // NOT the app config's synthetic viridis: an unconfigured field gets
    // the plot's own bright default (see resolveColorscale)
    const resolved = resolveColorscale("uniqueness", null, null);
    expect(resolved.length).toBeGreaterThan(0);
  });
});

describe("rampCss", () => {
  it("falls back to the built-in ramp for an empty colorscale", () => {
    // An empty array can reach here from a caller that skips
    // resolveColorscale (which never itself produces one) — must not crash
    expect(rampCss(0.5, [])).toBe(rampCss(0.5));
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

  it("resolves a named color palette entry to its actual RGB", () => {
    const indices = new Uint16Array([0]);
    const colors = buildColors({ style: "categorical", indices }, ["red"]);
    hexToRgb("#ff0000").forEach((channel, c) => {
      expect(rgbAt(colors, 0)[c]).toBeCloseTo(channel, 6);
    });
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

  it("uses a resolved colorscale instead of the built-in ramp", () => {
    const colorscale: Colorscale = [
      [0.9, 0.1, 0.1],
      [0.1, 0.9, 0.1],
    ];
    const values = new Float32Array([0, 1]);
    const colors = buildColors(
      { style: "continuous", values },
      [],
      { min: 0, max: 1 },
      colorscale,
    );

    // Float32Array quantizes these, so compare approximately, not exactly
    rgbAt(colors, 0).forEach((channel, c) => {
      expect(channel).toBeCloseTo(colorscale[0][c], 6);
    });
    rgbAt(colors, 1).forEach((channel, c) => {
      expect(channel).toBeCloseTo(colorscale[1][c], 6);
    });
    // The legend gradient must draw the exact same stops the points get
    // (Math.fround quantizes 0.9 below its exact value, so 229 not 230)
    expect(rampCss(0, colorscale)).toBe("rgb(229, 26, 26)");
    expect(rampCss(1, colorscale)).toBe("rgb(26, 229, 26)");
  });
});
