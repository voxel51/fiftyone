import { describe, expect, it } from "vitest";
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
        1
      );
      expect(generator("key1")).toBe(generator("key1"));
      expect(generator("key2")).toBe(generator("key2"));
    });

    it("should generate different colors for different seeds", () => {
      const generator1 = createColorGenerator(
        ["#ff0000", "#00ff00", "#0000ff"],
        1
      );
      const generator2 = createColorGenerator(
        ["#ff0000", "#00ff00", "#0000ff"],
        2
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
