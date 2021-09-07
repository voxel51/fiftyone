/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import colorString from "color-string";
import { MASK_ALPHA, SELECTED_MASK_ALPHA } from "./constants";
import { RGB, RGBA } from "./state";

const alphaCache: { [key: string]: string } = {};

const getRGBAAlphaArray = (color: string | RGB, alpha: number = 1): RGBA => {
  const rgba =
    typeof color === "string" ? colorString.get.rgb(color) : [...color, 255];

  rgba[3] = Math.min(Math.floor(Math.max(rgba[3], 255) * alpha), 255);
  return rgba as RGBA;
};

export const getAlphaColor = (color: string, alpha: number = 1): string => {
  const key = `${color}${alpha}`;

  if (key in alphaCache) {
    return alphaCache[key];
  }

  alphaCache[key] = colorString.to.rgb(getRGBAAlphaArray(color, alpha));
  return alphaCache[key];
};

const bitColorCache: { [color: string]: number } = {};

export const get32BitColor = (color: string | RGB, alpha: number = 1) => {
  const key = `${color}${alpha}`;
  if (key in bitColorCache) {
    return bitColorCache[key];
  }

  bitColorCache[key] = new Uint32Array(
    new Uint8Array(getRGBAAlphaArray(color, alpha)).buffer
  )[0];

  return bitColorCache[key];
};

let rawMaskColors = new Uint32Array(256);
let rawMaskColorsSelected = new Uint32Array(256);

let cachedColorMap = null;

export const getSegmentationColorArray = (
  colorMap: Function,
  selected: boolean
): Readonly<Uint32Array> => {
  if (cachedColorMap !== colorMap) {
    cachedColorMap = colorMap;
    for (let i = 0; i < 256; i++) {
      rawMaskColors[i] = get32BitColor(colorMap(i), MASK_ALPHA);
      rawMaskColorsSelected[i] = get32BitColor(
        colorMap(i),
        SELECTED_MASK_ALPHA
      );
    }
  }

  return selected ? rawMaskColorsSelected : rawMaskColors;
};

let rawColorscale = new Uint32Array(256);
let rawColorscaleSelected = new Uint32Array(256);

let cachedColorscale = null;

export const getColorscaleArray = (
  colorscale: RGB[],
  selected: boolean
): Readonly<Uint32Array> => {
  if (cachedColorscale !== colorscale) {
    cachedColorscale = colorscale;
    for (let i = 0; i < colorscale.length; i++) {
      rawColorscale[i] = get32BitColor(colorscale[i], MASK_ALPHA);
      rawColorscaleSelected[i] = get32BitColor(
        colorscale[i],
        SELECTED_MASK_ALPHA
      );
    }
  }

  return selected ? rawColorscaleSelected : rawColorscale;
};
