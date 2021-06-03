/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import colorString from "color-string";

const alphaCache: { [key: string]: string } = {};

type RGBA = [number, number, number, number];

const getRGBAAlphaArray = (color: string, alpha?: number): RGBA => {
  const rgba = colorString.get.rgb(color);
  if (alpha) {
    rgba[3] *= alpha;
  }
  return rgba;
};

export const getAlphaColor = (color: string, alpha: number): string => {
  const key = `${color}${alpha}`;
  if (key in alphaCache) {
    return alphaCache[color];
  }
  alphaCache[key] = colorString.to.rgb(getRGBAAlphaArray(color, alpha));
  return alphaCache[key];
};

const bitColorCache: { [color: string]: number } = {};

export const get32BitColor = (color: string) => {
  if (color in bitColorCache) {
    return bitColorCache[color];
  }

  bitColorCache[color] = new Uint32Array(
    new Uint8Array(getRGBAAlphaArray(color)).buffer
  )[0];

  return bitColorCache[color];
};
