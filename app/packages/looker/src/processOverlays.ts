/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { Svg } from "@svgdotjs/svg.js";
import { CONTAINS, Overlay } from "./overlays/base";
import ClassificationsOverlay from "./overlays/classifications";
import { BaseState } from "./state";
import { elementBBox, getPixelCoordinates, rotate } from "./util";

const processOverlays = <State extends BaseState>(
  svg: Svg,
  state: State,
  overlays: Overlay<State>[]
): [Overlay<State>[], number] => {
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
    ordered = [[classifications, ...ordered], state.rotate];
  }

  if (overlays.length < 1) {
    return [ordered, state.rotate];
  }

  if (state.config.thumbnail || !state.cursorCoordinates) {
    return [ordered, state.rotate];
  }

  const bbox = elementBBox(svg.node);
  const [x, y] = getPixelCoordinates(
    state.cursorCoordinates,
    state.config.dimensions,
    bbox
  );

  let contained = ordered
    .filter((o) => o.containsPoint(state, [x, y]) > CONTAINS.NONE)
    .sort(
      (a, b) =>
        a.getMouseDistance(state, [x, y]) - b.getMouseDistance(state, [x, y])
    );
  const outside = ordered.filter(
    (o) =>
      o instanceof ClassificationsOverlay ||
      o.containsPoint(state, [x, y]) === CONTAINS.NONE
  );

  let newRotate = state.rotate;
  if (state.rotate !== 0) {
    [contained, newRotate] = rotate(contained, state.rotate);
  }
  if (state.options.onlyShowHoveredLabel) {
    return [contained.length ? [contained[0]] : [], newRotate];
  }

  return [[...contained, ...outside], newRotate];
};

export default processOverlays;
