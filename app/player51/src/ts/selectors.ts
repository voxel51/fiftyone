/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

export const getPixelCoordinates = function (state) {
  if (e.type.toLowerCase() === "mousemove") {
    this._mouseX = e.clientX;
    this._mouseY = e.clientY;
    this._rect = e.target.getBoundingClientRect();
  }
  let [x, y] = [this._mouseX, this._mouseY];

  if (this._rect) {
    x = x - this._rect.left;
    y = y - this._rect.top;
  }

  return [
    Math.round(rescale(x, 0, this._rect.width, 0, this.eleCanvas.width)),
    Math.round(rescale(y, 0, this._rect.height, 0, this.eleCanvas.height)),
  ];
};
