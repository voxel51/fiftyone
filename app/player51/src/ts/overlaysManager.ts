/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { ClassificationsOverlay, FROM_FO } from "./overlays";

function resetCanvas(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  context.clearRect(0, 0, width, height);
  context.strokeStyle = "#fff";
  context.fillStyle = "#fff";
  context.lineWidth = 3;
  context.font = "14px sans-serif";
  // easier for setting offsets
  context.textBaseline = "bottom";
  context;
}

class OverlaysManager {
  constructor() {}

  getOverlays(
    key,
    sourceResolver,
    canvas: HTMLCanvasElement,
    width: number,
    height: number
  ) {
    const classifications = [];
    for (const field in this.sample) {
      const label = this.sample[field];
      if (!label) {
        continue;
      }
      if (label._cls in FROM_FO) {
        const overlays = FROM_FO[label._cls](field, label, this);
        overlays.forEach((o) =>
          o.setup(context, this.canvasWidth, this.canvasHeight)
        );
        this._overlays = [...this._overlays, ...overlays];
      } else if (label._cls === "Classification") {
        classifications.push([field, [null, [label]]]);
      } else if (label._cls === "Classifications") {
        classifications.push([field, [null, label.classifications]]);
      }
    }

    if (classifications.length > 0) {
      const overlay = new ClassificationsOverlay(classifications, this);
      overlay.setup(context, this.canvasWidth, this.canvasHeight);
      this._overlays.push(overlay);
    }
    this._updateOverlayOptionVisibility();
    this._reBindMouseHandler();

    this.updateFromLoadingState();
    this.updateFromDynamicState();
  }

  setTopOverlays({ x, y }, overlays) {
    if (
      this.player.options.thumbnail ||
      [-1, null].includes(x) ||
      [-1, null].includes(y)
    ) {
      return overlays;
    }

    if (!overlays || !overlays.length) {
      return overlays;
    }

    const contained = overlays
      .filter((o) => o.containsPoint(x, y) > 0)
      .sort((a, b) => a.getMouseDistance(x, y) - b.getMouseDistance(x, y));
    const outside = overlays.filter(
      (o) => o instanceof ClassificationsOverlay || o.containsPoint(x, y) === 0
    );

    return [...contained, ...outside];
  }

  getOrderedOverlays(coords) {
    if (this._orderedOverlayCache) {
      return this._orderedOverlayCache;
    }
    const overlays = this._overlays;

    if (!overlays) {
      return [];
    }

    const activeLabels = this.options.activeLabels;

    const bins = Object.fromEntries(activeLabels.map((l) => [l, []]));
    let classifications = null;

    for (const overlay of overlays) {
      if (overlay instanceof ClassificationsOverlay) {
        classifications = overlay;
        continue;
      }

      if (!(overlay.field in bins)) continue;

      bins[overlay.field].push(overlay);
    }

    let ordered = activeLabels.reduce((acc, cur) => [...acc, ...bins[cur]], []);

    if (classifications) {
      ordered = [classifications, ...ordered];
    }

    return this._setTopOverlays(coords, ordered);
  }

  isFocus(overlayObj) {
    return (
      this._focusedObject === overlayObj ||
      overlayObj.index === this._focusIndex
    );
  }

  setFocus(overlayObj, position = undefined) {
    if (!this._canFocus) {
      overlayObj = position = undefined;
    }
    if (position) {
      this._focusPos = position;
    }
    if (this._focusedObject !== overlayObj) {
      this._focusedObject = overlayObj;
      if (overlayObj === undefined) {
        this._focusedObject = undefined;
        this._focusIndex = -1;
      } else {
        this._focusIndex =
          overlayObj.index !== undefined ? overlayObj.index : -1;
      }
      return true;
    }
    return false;
  }
}
