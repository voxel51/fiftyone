/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BIG_ENDIAN, MASK_ALPHA } from "./constants";
import { RGB, RGBA } from "./state";

const bitColorCache: { [color: string]: number } = {};

export const get32BitColor = (color: string | RGB, alpha: number = 1) => {
  alpha = Math.round(alpha * 255);
  const key = `${color}${alpha}`;
  if (key in bitColorCache) {
    return bitColorCache[key];
  }

  let r,
    g,
    b = 0;

  if (typeof color === "string") {
    if (color.startsWith("#")) {
      [r, g, b] = hexToRGB(color);
    } else if (color.startsWith("rgb")) {
      let sep = color.indexOf(",") > -1 ? "," : " ";
      [r, g, b] = color.slice(4).split(")")[0].split(sep);
    } else if (color.startsWith("hsl")) {
      [r, g, b] = hslToRGB(color);
    }
  } else {
    [r, g, b] = color;
  }

  bitColorCache[key] = BIG_ENDIAN
    ? (r << 24) | (g << 16) | (b << 8) | alpha
    : (alpha << 24) | (b << 16) | (g << 8) | r;

  return bitColorCache[key];
};

export const getRGBA = (value: number): RGBA => {
  const uint32 = new Uint32Array(1);
  uint32[0] = value;

  return [...new Uint8Array(uint32.buffer)] as RGBA;
};

export const getRGBAColor = ([r, g, b, a]: RGBA) => {
  return `rgba(${r},${g},${b},${a / 255})`;
};

let rawMaskColors = new Uint32Array(256);

let cachedColorMap = null;

export const getSegmentationColorArray = (
  colorMap: Function
): Readonly<Uint32Array> => {
  if (cachedColorMap !== colorMap) {
    cachedColorMap = colorMap;
    for (let i = 0; i < 256; i++) {
      rawMaskColors[i] = get32BitColor(colorMap(i), MASK_ALPHA);
    }
  }

  return rawMaskColors;
};

let rawColorscale = new Uint32Array(256);

let cachedColorscale = null;

export const getColorscaleArray = (
  colorscale: RGB[]
): Readonly<Uint32Array> => {
  if (cachedColorscale !== colorscale) {
    cachedColorscale = colorscale;
    for (let i = 0; i < colorscale.length; i++) {
      rawColorscale[i] = get32BitColor(colorscale[i], MASK_ALPHA);
    }
  }

  return rawColorscale;
};

const hexToRGB = (hex: string): RGB => {
  let r = 0,
    g = 0,
    b = 0;

  if (hex.length == 4) {
    r = +("0x" + hex[1] + hex[1]);
    g = +("0x" + hex[2] + hex[2]);
    b = +("0x" + hex[3] + hex[3]);
  } else if (hex.length == 7) {
    r = +("0x" + hex[1] + hex[2]);
    g = +("0x" + hex[3] + hex[4]);
    b = +("0x" + hex[5] + hex[6]);
  }

  return [r, g, b];
};

const hslToRGB = (hsl): RGB => {
  let sep = hsl.indexOf(",") > -1 ? "," : " ";
  let [h, s, l] = hsl.slice(4).split(")")[0].split(sep);

  h /= 360;
  s /= 100;
  l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [r, g, b];
};
