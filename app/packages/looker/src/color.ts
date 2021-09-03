/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import colorString from "color-string";
import { MASK_ALPHA, SELECTED_MASK_ALPHA } from "./constants";

const alphaCache: { [key: string]: string } = {};

type RGBA = [number, number, number, number];

const getRGBAAlphaArray = (color: string, alpha?: number): RGBA => {
  const rgba = colorString.get.rgb(color);
  if (alpha) {
    rgba[3] *= alpha;
  }
  rgba[3] = Math.min(Math.floor(255 * rgba[3]), 255);
  return rgba;
};

export const getAlphaColor = (color: string, alpha: number): string => {
  const key = `${color}${alpha}`;

  if (key in alphaCache) {
    return alphaCache[key];
  }

  alphaCache[key] = colorString.to.rgb(getRGBAAlphaArray(color, alpha));
  return alphaCache[key];
};

const bitColorCache: { [color: string]: number } = {};

export const get32BitColor = (color: string, alpha?: number) => {
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

let rawMapColors = new Uint32Array(256);
let rawMapColorsSelected = new Uint32Array(256);

let cachedColorscale = null;

export const getHeatmapColorArray = (
  colorscale: [],
  selected: boolean
): Readonly<Uint32Array> => {
  if (cachedColorscale !== colorscale) {
    cachedColorscale = colorscale;
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
