/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Color parsing and conversion utilities for PixiJS rendering.
 */

/**
 * Parses a CSS color string and converts it to PixiJS color format with alpha.
 * Supports hex, rgb, rgba, hsl, and hsla color formats.
 *
 * @param color - CSS color string (e.g., "#ff0000", "rgb(255,0,0)", "hsl(0,100%,50%)")
 * @returns Object containing color (as hex number) and alpha (0-1)
 */
export function parseColorWithAlpha(color: string): {
  color: number;
  alpha: number;
} {
  // Convert CSS color to PixiJS color format
  if (color.startsWith("#")) {
    const hex = parseInt(color.slice(1), 16);
    const alpha = 1;
    return { color: hex, alpha };
  }

  if (color.startsWith("rgb")) {
    // Handle rgba and rgb formats
    const match = color.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
    );
    if (match) {
      const [, r, g, b, a] = match;
      const alpha = a ? parseFloat(a) : 1;
      const hex = (parseInt(r) << 16) | (parseInt(g) << 8) | parseInt(b);
      return { color: hex, alpha };
    }
  }

  if (color.startsWith("hsl")) {
    // Handle hsla and hsl formats
    const match = color.match(
      /hsla?\(([\d.]+),\s*(\d+)%,\s*(\d+)%(?:,\s*([\d.]+))?\)/
    );
    if (match) {
      const [, h, s, l, a] = match;
      const alpha = a ? parseFloat(a) : 1;
      const rgb = hslToRgb(parseFloat(h), parseInt(s), parseInt(l));
      const hex = (rgb.r << 16) | (rgb.g << 8) | rgb.b;
      return { color: hex, alpha };
    }
  }

  // Default to black
  return { color: 0x000000, alpha: 1 };
}

/**
 * Converts HSL color values to RGB.
 *
 * @param h - Hue (0-360)
 * @param s - Saturation (0-100)
 * @param l - Lightness (0-100)
 * @returns RGB object with values 0-255
 */
export function hslToRgb(
  h: number,
  s: number,
  l: number
): { r: number; g: number; b: number } {
  // Normalize hue to 0-360
  h = h % 360;
  if (h < 0) h += 360;

  // Normalize saturation and lightness to 0-1
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (h >= 300 && h < 360) {
    r = c;
    g = 0;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * Generates a deterministic color from a string ID using hash-based HSL generation.
 * Useful for creating consistent colors for overlays based on their identifiers.
 *
 * @param id - String identifier to generate color from
 * @param saturation - Saturation percentage (0-100), defaults to 70
 * @param lightness - Lightness percentage (0-100), defaults to 50
 * @returns HSL color string
 */
export function generateColorFromId(
  id: string,
  saturation: number = 70,
  lightness: number = 50
): string {
  // Create a hash from the overlay ID for deterministic color generation
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Use hash to generate consistent HSL color
  const hue = Math.abs(hash) % 360;

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
