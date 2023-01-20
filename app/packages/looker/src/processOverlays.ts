/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import { CONTAINS, Overlay } from "./overlays/base";
import { ClassificationsOverlay } from "./overlays/classifications";
import { BaseState } from "./state";
import { rotate } from "./util";

const processOverlays = <State extends BaseState>(
  state: State,
  overlays: Overlay<State>[]
): [Overlay<State>[], number] => {
  const activePaths = state.options.activePaths;
  const bins = Object.fromEntries(
    activePaths.map<[string, Overlay<State>[]]>((l) => [l, []])
  );

  let classifications = null;

  if (!state.config.thumbnail && !state.options.showOverlays) {
    return [[], 0];
  }

  for (const overlay of overlays) {
    if (overlay instanceof ClassificationsOverlay) {
      classifications = overlay;
      continue;
    }

    if (!(overlay.field && overlay.field in bins)) continue;

    if (!overlay.isShown(state)) continue;

    bins[overlay.field].push(overlay);
  }

  let ordered = activePaths.reduce((acc, cur) => [...acc, ...bins[cur]], []);

  if (classifications && !state.config.thumbnail) {
    ordered = [classifications, ...ordered];
  }

  if (overlays.length < 1) {
    return [ordered, 0];
  }

  if (state.config.thumbnail || !state.cursorCoordinates) {
    return [ordered, 0];
  }

  const [x, y] = state.pixelCoordinates;

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
