import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyAlpha,
  createColorGenerator,
  default_app_color,
  get32BitColor,
  getColor,
  getColorscaleArray,
  getRGB,
  getRGBA,
  hexToRgb,
  interpolateColorsHex,
  interpolateColorsRgb,
  RGB,
  rgbStringToHex,
  rgbToHexCached,
} from "./color";

describe("Color Utilities", () => {
  describe("rgbStringToHex", () => {
    it("should convert rgb string to hex", () => {
      expect(rgbStringToHex("rgb(255, 255, 255)")).toBe("#ffffff");
      expect(rgbStringToHex("rgb(0, 0, 0)")).toBe("#000000");
      expect(rgbStringToHex("rgb(255, 0, 0)")).toBe("#ff0000");
    });

    it("should handle rgb strings with spaces", () => {
      expect(rgbStringToHex("rgb(255, 255, 255)")).toBe("#ffffff");
      expect(rgbStringToHex("rgb( 255 , 255 , 255 )")).toBe("#ffffff");
    });

    it("should handle rgb strings with no spaces", () => {
      expect(rgbStringToHex("rgb(255,0,0)")).toBe("#ff0000");
    });

    it("should throw an error if the rgb string is invalid", () => {
      expect(() => rgbStringToHex("invalid")).toThrow();
      expect(() => rgbStringToHex("rgb(256, 255, 255)")).toThrow();
    });
  });

  describe("hexToRgb", () => {
    it("should convert hex to rgb array", () => {
      expect(hexToRgb("#ffffff")).toEqual([255, 255, 255]);
      expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
      expect(hexToRgb("#ff0000")).toEqual([255, 0, 0]);
    });

    it("should handle hex without # prefix", () => {
      expect(hexToRgb("ffffff")).toEqual([255, 255, 255]);
    });

    it("should return null for invalid hex", () => {
      expect(hexToRgb("invalid")).toBeNull();
      expect(hexToRgb("#gggggg")).toBeNull();
    });
  });

  describe("rgbToHexCached", () => {
    it("should convert rgb array to hex", () => {
      expect(rgbToHexCached([255, 255, 255])).toBe("#FFFFFF");
      expect(rgbToHexCached([0, 0, 0])).toBe("#000000");
      expect(rgbToHexCached([255, 0, 0])).toBe("#FF0000");
    });

    it("should cache results", () => {
      const result1 = rgbToHexCached([255, 255, 255]);
      const result2 = rgbToHexCached([255, 255, 255]);
      expect(result1).toBe(result2);
    });
  });

  describe("applyAlpha", () => {
    it("should apply alpha to color", () => {
      expect(applyAlpha("#ff0000", 0.5)).toBe("rgba(255,0,0,0.5)");
      expect(applyAlpha("rgb(255, 0, 0)", 0.5)).toBe("rgba(255,0,0,0.5)");
    });
  });

  describe("interpolateColors", () => {
    it("should interpolate between two colors", () => {
      expect(interpolateColorsHex("#000000", "#ffffff", 0.5)).toBe("#808080");
      expect(interpolateColorsRgb([0, 0, 0], [255, 255, 255], 0.5)).toEqual([
        128, 128, 128,
      ]);
    });

    it("should handle edge cases", () => {
      expect(interpolateColorsHex("#000000", "#ffffff", 0)).toBe("#000000");
      expect(interpolateColorsHex("#000000", "#ffffff", 1)).toBe("#FFFFFF");
    });
  });

  describe("get32BitColor", () => {
    it("should convert string colors to 32-bit integers", () => {
      const result = get32BitColor("#ff0000", 1);
      const rgba = getRGBA(result);
      expect(rgba).toEqual([255, 0, 0, 255]);
    });

    it("should convert RGB arrays to 32-bit integers", () => {
      const result = get32BitColor([255, 0, 0], 1);
      const rgba = getRGBA(result);
      expect(rgba).toEqual([255, 0, 0, 255]);
    });

    it("should handle alpha values", () => {
      const result = get32BitColor("#ff0000", 0.5);
      const rgba = getRGBA(result);
      expect(rgba).toEqual([255, 0, 0, 128]);
    });

    it("should cache results", () => {
      const result1 = get32BitColor("#ff0000", 1);
      const result2 = get32BitColor("#ff0000", 1);
      expect(result1).toBe(result2);
    });
  });

  describe("getColorscaleArray", () => {
    it("should create a colorscale array", () => {
      const colorscale: RGB[] = [
        [0, 0, 0],
        [255, 255, 255],
      ];
      const result = getColorscaleArray(colorscale, 1);
      expect(result).toBeInstanceOf(Uint32Array);
      expect(result.length).toBe(256);
    });

    it("should cache results for same colorscale", () => {
      const colorscale: RGB[] = [
        [0, 0, 0],
        [255, 255, 255],
      ];
      const result1 = getColorscaleArray(colorscale, 1);
      const result2 = getColorscaleArray(colorscale, 1);
      expect(result1).toBe(result2);
    });
  });

  describe("createColorGenerator", () => {
    it("should generate consistent colors for same seed", () => {
      const generator = createColorGenerator(
        ["#ff0000", "#00ff00", "#0000ff"],
        1,
      );
      expect(generator("key1")).toBe(generator("key1"));
      expect(generator("key2")).toBe(generator("key2"));
    });

    it("should generate different colors for different seeds", () => {
      const generator1 = createColorGenerator(
        ["#ff0000", "#00ff00", "#0000ff"],
        1,
      );
      const generator2 = createColorGenerator(
        ["#ff0000", "#00ff00", "#0000ff"],
        2,
      );
      expect(generator1("key1")).not.toBe(generator2("key1"));
    });

    it("should cycle through colors when pool is exhausted", () => {
      const generator = createColorGenerator(["#ff0000", "#00ff00"], 1);
      expect(generator("key1")).toBe("#ff0000");
      expect(generator("key2")).toBe("#00ff00");
      expect(generator("key3")).toBe("#ff0000");
    });

    it("should handle null values", () => {
      const generator = createColorGenerator(["#ff0000", "#00ff00"], 1);
      const color = generator(null);
      expect(["#ff0000", "#00ff00"]).toContain(color);
    });
  });

  describe("getColor", () => {
    it("should use default color pool if none provided", () => {
      const color = getColor(null, 1, "key1");
      expect(default_app_color).toContain(color);
    });

    it("should generate consistent colors for same seed and value", () => {
      const pool = ["#ff0000", "#00ff00"];
      expect(getColor(pool, 1, "key1")).toBe(getColor(pool, 1, "key1"));
    });

    it("should generate different colors for different seeds", () => {
      const pool = ["#ff0000", "#00ff00"];
      expect(getColor(pool, 1, "key1")).not.toBe(getColor(pool, 2, "key1"));
    });
  });

  describe("hslToRGB", () => {
    it("should convert HSL to RGB", () => {
      const rgb = getRGB("hsl(0,100,50)");
      expect(rgb[0] * 255).toBeCloseTo(255, 0);
      expect(rgb[1] * 255).toBeCloseTo(0, 0);
      expect(rgb[2] * 255).toBeCloseTo(0, 0);
    });
  });
});

// `resolveCssColor` reads colours through a probe element. jsdom's CSSOM
// rejects `var()` / `color-mix()` values and never substitutes variables, so
// these tests stand in for the browser at the two seams the resolver uses:
// the probe's `style.color` setter (accepts or rejects a value) and
// `getComputedStyle` (what the value evaluates to). The module caches its
// probe and pixel canvas, so each test imports a fresh copy.
describe("resolveCssColor", () => {
  const BRAND = "var(--color-brand-primary)";
  const MIX = "color-mix(in srgb, var(--color-brand-primary) 10%, transparent)";

  const styleStore = new WeakMap<object, string>();
  const colorDescriptor = Object.getOwnPropertyDescriptor(
    CSSStyleDeclaration.prototype,
    "color",
  );
  let rejectCssColor = false;
  let computedColor = "";

  const load = async () => {
    vi.resetModules();
    return await import("./color");
  };

  beforeEach(() => {
    rejectCssColor = false;
    computedColor = "";
    Object.defineProperty(CSSStyleDeclaration.prototype, "color", {
      configurable: true,
      get() {
        return styleStore.get(this) ?? "";
      },
      set(value: string) {
        styleStore.set(this, rejectCssColor ? "" : value);
      },
    });
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () => ({ color: computedColor }) as CSSStyleDeclaration,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (colorDescriptor) {
      Object.defineProperty(
        CSSStyleDeclaration.prototype,
        "color",
        colorDescriptor,
      );
    }
    document.querySelectorAll("html > span").forEach((probe) => probe.remove());
  });

  it("passes plain literals through without touching the DOM", async () => {
    const { resolveCssColor } = await load();
    for (const literal of [
      "#ff6d04",
      "rgb(255, 109, 4)",
      "hsl(25, 100%, 51%)",
      "transparent",
    ]) {
      expect(resolveCssColor(literal)).toBe(literal);
    }
    expect(window.getComputedStyle).not.toHaveBeenCalled();
  });

  it("passes non-colour var() references through untouched", async () => {
    const { resolveCssColor } = await load();
    const font = "var(--fo-fontFamily-body)";
    expect(resolveCssColor(font)).toBe(font);
    expect(window.getComputedStyle).not.toHaveBeenCalled();
  });

  it("evaluates a colour token to its computed rgb()", async () => {
    const { resolveCssColor } = await load();
    computedColor = "rgb(250, 83, 0)";
    expect(resolveCssColor(BRAND)).toBe("rgb(250, 83, 0)");
    expect(resolveCssColor("var(--fo-palette-text-primary)")).toBe(
      "rgb(250, 83, 0)",
    );
  });

  it("accepts a var() reference that carries a fallback", async () => {
    const { resolveCssColor } = await load();
    computedColor = "rgb(1, 2, 3)";
    expect(resolveCssColor("var(--color-bg-card, #000)")).toBe("rgb(1, 2, 3)");
  });

  it("rewrites a color(srgb …) computed value to legacy rgb()/rgba()", async () => {
    const { resolveCssColor } = await load();
    computedColor = "color(srgb 1 0 0.5)";
    expect(resolveCssColor(MIX)).toBe("rgb(255, 0, 128)");
    computedColor = "color(srgb 0.980392 0.32549 0 / 0.1)";
    expect(resolveCssColor(MIX)).toBe("rgba(250, 83, 0, 0.1)");
    computedColor = "color(srgb none 1 none / 50%)";
    expect(resolveCssColor(MIX)).toBe("rgba(0, 255, 0, 0.5)");
  });

  it("reads an unparseable computed value back through a 1x1 canvas", async () => {
    const getImageData = vi.fn(() => ({
      data: new Uint8ClampedArray([10, 20, 30, 128]),
    }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      getImageData,
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D);
    const { resolveCssColor } = await load();
    computedColor = "lab(50% 40 59.5)";
    expect(resolveCssColor(BRAND)).toBe("rgba(10, 20, 30, 0.502)");
    expect(getImageData).toHaveBeenCalledWith(0, 0, 1, 1);
  });

  it("returns the computed value as-is when no canvas is available", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { resolveCssColor } = await load();
    computedColor = "lab(50% 40 59.5)";
    expect(resolveCssColor(BRAND)).toBe("lab(50% 40 59.5)");
  });

  it("returns the input when the browser rejects the expression", async () => {
    const { resolveCssColor } = await load();
    rejectCssColor = true;
    computedColor = "rgb(0, 0, 0)";
    expect(resolveCssColor("var(--color-not-a-colour)")).toBe(
      "var(--color-not-a-colour)",
    );
    expect(window.getComputedStyle).not.toHaveBeenCalled();
  });

  it("re-reads the current value on every call", async () => {
    const { resolveCssColor } = await load();
    computedColor = "rgb(0, 0, 0)";
    expect(resolveCssColor(BRAND)).toBe("rgb(0, 0, 0)");
    computedColor = "rgb(255, 255, 255)";
    expect(resolveCssColor(BRAND)).toBe("rgb(255, 255, 255)");
  });

  it("creates a single hidden probe element", async () => {
    const { resolveCssColor } = await load();
    computedColor = "rgb(0, 0, 0)";
    resolveCssColor(BRAND);
    resolveCssColor(BRAND);
    const probes = document.querySelectorAll("html > span");
    expect(probes).toHaveLength(1);
    expect((probes[0] as HTMLElement).style.display).toBe("none");
  });
});

describe("resolveCssColorsDeep", () => {
  beforeEach(() => {
    Object.defineProperty(CSSStyleDeclaration.prototype, "color", {
      configurable: true,
      get() {
        return "set";
      },
      set() {
        // every value is accepted; the getter above reports it as applied
      },
    });
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () => ({ color: "rgb(250, 83, 0)" }) as CSSStyleDeclaration,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    const original = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(document.createElement("span").style),
      "color",
    );
    if (original) {
      Object.defineProperty(CSSStyleDeclaration.prototype, "color", original);
    }
  });

  const load = async () => {
    vi.resetModules();
    return await import("./color");
  };

  it("resolves every colour string in a nested layout", async () => {
    const { resolveCssColorsDeep } = await load();
    const layout = {
      font: {
        color: "var(--color-text-secondary)",
        family: "var(--fo-fontFamily-body)",
      },
      xaxis: { gridcolor: "var(--color-border-default)", showgrid: true },
      colorway: ["var(--color-viz-chart-1)", "#123456"],
    };
    expect(resolveCssColorsDeep(layout)).toEqual({
      font: { color: "rgb(250, 83, 0)", family: "var(--fo-fontFamily-body)" },
      xaxis: { gridcolor: "rgb(250, 83, 0)", showgrid: true },
      colorway: ["rgb(250, 83, 0)", "#123456"],
    });
  });

  it("keeps the identity of branches it did not change", async () => {
    const { resolveCssColorsDeep } = await load();
    const untouched = { size: 14, family: "Palanquin", flags: [true, 1] };
    const input = { untouched, color: "var(--color-brand-primary)" };
    const out = resolveCssColorsDeep(input);
    expect(out).not.toBe(input);
    expect(out.untouched).toBe(untouched);
    const literalOnly = { a: "#fff", b: ["rgb(0,0,0)"] };
    expect(resolveCssColorsDeep(literalOnly)).toBe(literalOnly);
  });

  it("leaves class instances and non-plain objects alone", async () => {
    const { resolveCssColorsDeep } = await load();
    const date = new Date(0);
    const typed = new Float32Array([1, 2]);
    const input = { date, typed, n: null, u: undefined };
    const out = resolveCssColorsDeep(input);
    expect(out).toBe(input);
    expect(out.date).toBe(date);
    expect(out.typed).toBe(typed);
  });
});
