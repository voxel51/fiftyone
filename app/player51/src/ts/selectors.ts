/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState, Coordinates } from "./state";

export const getPixelCoordinates = function (
  state: Readonly<BaseState>
): Coordinates {
  if (this._rect) {
    x = x - this._rect.left;
    y = y - this._rect.top;
  }

  return [
    Math.round(rescale(x, 0, this._rect.width, 0, this.eleCanvas.width)),
    Math.round(rescale(y, 0, this._rect.height, 0, this.eleCanvas.height)),
  ];
};
