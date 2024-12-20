/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Overlay } from "./overlays/base";
import { CONTAINS } from "./overlays/base";
import { ClassificationsOverlay } from "./overlays/classifications";
import HeatmapOverlay from "./overlays/heatmap";
import SegmentationOverlay from "./overlays/segmentation";
import type { BaseState } from "./state";
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

    // skip if mask_path is present but mask is not (segmentations)
    if (overlay.label.mask_path && !overlay.label.mask) {
      continue;
    }
    // for heatmaps
    if (overlay.label.map_path && !overlay.label.map) {
      continue;
    }

    if (!(overlay.field && overlay.field in bins)) continue;

    // todo: find a better approach / place for this.
    // for instance, this won't work in detection overlay, where
    // we might want the bounding boxes but masks might not have been loaded
    if (
      overlay instanceof SegmentationOverlay &&
      overlay.label.mask_path &&
      !overlay.label.mask
    ) {
      continue;
    }

    if (
      overlay instanceof HeatmapOverlay &&
      overlay.label.map_path &&
      !overlay.label.map
    ) {
      continue;
    }

    if (!overlay.isShown(state)) continue;

    if (filter(overlay, bins)) continue;

    bins[overlay.field].push(overlay);
  }

  let ordered = activePaths.reduce((acc, cur) => {
    acc.push(...bins[cur]);
    return acc;
  }, []);

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

export const filter = <State extends BaseState>(
  overlay: Overlay<State>,
  bins: {
    [k: string]: Overlay<State>[];
  }
) => {
  if (!(overlay.field && overlay.field in bins)) return true;

  // todo: find a better approach / place for this.
  // for instance, this won't work in detection overlay, where
  // we might want the bounding boxes but masks might not have been loaded
  if (overlay instanceof HeatmapOverlay && !overlay.label.map) {
    return true;
  }

  if (overlay instanceof SegmentationOverlay && !overlay.label.mask) {
    return true;
  }

  return false;
};

export default processOverlays;
