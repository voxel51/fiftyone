/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { DispatchEvent } from "../base";

export const dispatchTooltipEvent = (
  dispatchEvent: DispatchEvent,
  nullify = false
) => {
  return (state, overlays) => {
    if (state.tooltipDisabled) {
      return;
    }
    if (!state.options.showTooltip) {
      return;
    }
    let detail =
      overlays.length && overlays[0].containsPoint(state) && !nullify
        ? overlays[0].getPointInfo(state)
        : null;

    // @ts-ignore
    if (state.frameNumber && detail) {
      // @ts-ignore
      detail.frameNumber = state.frameNumber;
    }
    dispatchEvent(
      "tooltip",
      detail
        ? {
            ...detail,
            coordinates: state.cursorCoordinates,
          }
        : null
    );
  };
};
