/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

export default class OverlaysManager {
  constructor() {}

  setTopOverlays({ curs }, overlays) {
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
