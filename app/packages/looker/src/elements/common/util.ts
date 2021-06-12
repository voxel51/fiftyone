/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { SCALE_FACTOR } from "../../constants";
import { BaseState, StateUpdate } from "../../state";
import { clampScale } from "../../util";
import { DispatchEvent } from "../base";

export const dispatchTooltipEvent = (dispatchEvent: DispatchEvent) => {
  return (state, overlays) => {
    // @ts-ignore
    if (state.playing || state.config.thumbnail) {
      return;
    }
    if (!state.options.showTooltip) {
      return;
    }
    let detail =
      overlays.length && overlays[0].containsPoint(state)
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

export const zoomIn = (update: StateUpdate<BaseState>) => {
  update(({ scale, windowBBox: [_, __, ww, wh], config: { dimensions } }) => ({
    scale: clampScale([ww, wh], dimensions, scale * SCALE_FACTOR),
  }));
};

export const zoomOut = (update: StateUpdate<BaseState>) => {
  update(({ scale, windowBBox: [_, __, ww, wh], config: { dimensions } }) => ({
    scale: clampScale([ww, wh], dimensions, scale / SCALE_FACTOR),
  }));
};

export const toggleFullscreen = (update: StateUpdate<BaseState>) => {
  update(({ fullscreen, config: { thumbnail } }) =>
    thumbnail ? {} : { fullscreen: !fullscreen }
  );
};

export const toggleHelp = (update: StateUpdate<BaseState>) => {
  update(({ showHelp, config: { thumbnail } }) =>
    thumbnail ? {} : { showHelp: !showHelp }
  );
};

export const toggleOptions = (update: StateUpdate<BaseState>) => {
  update(({ showOptions, loaded, config: { thumbnail } }) => {
    if (thumbnail) {
      return {};
    } else if (showOptions) {
      return {
        showOptions: false,
      };
    } else {
      return {
        showControls: loaded,
        showOptions: loaded,
      };
    }
  });
};

export const next = (dispatchEvent: DispatchEvent) => {
  dispatchEvent("next");
};

export const previous = (dispatchEvent: DispatchEvent) => {
  dispatchEvent("previous");
};
