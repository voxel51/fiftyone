/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { Overlay } from "./overlays/base";
import ClassificationsOverlay from "./overlays/classifications";
import { BaseState } from "./state";
import { getCanvasCoordinates, rotate } from "./util";

const processOverlays = <State extends BaseState>(
  context: CanvasRenderingContext2D,
  state: State,
  overlays: Overlay<State>[]
): Overlay<State>[] => {
  const activeLabels = state.options.activeLabels;
  const bins = Object.fromEntries(activeLabels.map((l) => [l, []]));
  let classifications = null;

  for (const overlay of overlays) {
    if (overlay instanceof ClassificationsOverlay) {
      classifications = overlay;
      continue;
    }

    if (!(overlay.field in bins)) continue;

    if (!overlay.isShown(state)) continue;

    bins[overlay.field].push(overlay);
  }

  let ordered = activeLabels.reduce((acc, cur) => [...acc, ...bins[cur]], []);

  if (classifications) {
    ordered = [classifications, ...ordered];
  }

  if (overlays.length < 1) {
    return ordered;
  }

  if (state.config.thumbnail || !state.cursorCoordinates) {
    return ordered;
  }

  const [x, y] = getCanvasCoordinates(
    state.cursorCoordinates,
    state.pan,
    state.scale,
    context.canvas
  );

  let contained = overlays
    .filter((o) => o.containsPoint(context, state, [x, y]) > 0)
    .sort(
      (a, b) =>
        a.getMouseDistance(context, state, [x, y]) -
        b.getMouseDistance(context, state, [x, y])
    );
  const outside = overlays.filter(
    (o) =>
      o instanceof ClassificationsOverlay ||
      o.containsPoint(context, state, [x, y]) === 0
  );

  if (state.rotate !== 0) {
    contained = rotate(contained, state.rotate);
  }

  return [...contained, ...outside];
};

export default processOverlays;
