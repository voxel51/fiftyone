/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { Overlay } from "./overlays/base";
import { BaseState } from "./state";

type OverlaySorter<State extends BaseState> = (
  context: CanvasRenderingContext2D,
  state: State,
  overlays: Overlay<State>[]
) => Overlay<State>[];

export const getOverlaySorter = <State extends BaseState>(): OverlaySorter<
  State
> => {
  let cache = null;
  return (
    context: CanvasRenderingContext2D,
    state: State,
    overlays: Overlay<State>[]
  ): Overlay<State>[] => {
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

    let sortedOverlays = [];

    if (overlays.length < 1) {
      return sortedOverlays;
    }

    if (state.config.thumbnail || !state.cursorCoordinates) {
      return sortedOverlays;
    }

    const contained = overlays
      .filter((o) => o.containsPoint(x, y) > 0)
      .sort((a, b) => a.getMouseDistance(x, y) - b.getMouseDistance(x, y));
    const outside = overlays.filter(
      (o) => o instanceof ClassificationsOverlay || o.containsPoint(x, y) === 0
    );
    return [...contained, ...outside];
  };
};
