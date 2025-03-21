import { getImageElements } from "../elements";
import { COMMON_SHORTCUTS } from "../elements/common";
import type { Overlay } from "../overlays/base";
import type { ImageState } from "../state";
import { DEFAULT_IMAGE_OPTIONS } from "../state";
import { AbstractLooker } from "./abstract";
import { LookerUtils } from "./shared";

import {
  nextFrameNoOpControl,
  previousFrameNoOpControl,
} from "../elements/common/actions";
import { zoomToContent } from "../zoom";

export class ImageLooker extends AbstractLooker<ImageState> {
  getElements(config) {
    return getImageElements({
      abortController: this.abortController,
      config,
      dispatchEvent: this.getDispatchEvent(),
      update: this.updater,
    });
  }

  getInitialState(
    config: ImageState["config"],
    options: ImageState["options"]
  ) {
    const resolved = {
      ...this.getDefaultOptions(),
      ...options,
    };

    // if in dynamic groups mode, add < > shortcuts, too
    let shortcuts = { ...COMMON_SHORTCUTS };
    if (config.isDynamicGroup) {
      shortcuts = {
        ...COMMON_SHORTCUTS,
        previousFrameNoOpControl,
        nextFrameNoOpControl,
      };
    }

    return {
      ...this.getInitialBaseState(),
      config: { ...config },
      options: resolved,
      SHORTCUTS: shortcuts,
    };
  }

  getDefaultOptions() {
    return DEFAULT_IMAGE_OPTIONS;
  }

  hasDefaultZoom(state: ImageState, overlays: Overlay<ImageState>[]): boolean {
    let pan = [0, 0];
    let scale = 1;

    if (state.options.zoom) {
      const zoomState = zoomToContent(state, overlays);
      pan = zoomState.pan;
      scale = zoomState.scale;
    }

    return (
      scale === state.scale &&
      pan[0] === state.pan[0] &&
      pan[1] === state.pan[1]
    );
  }

  postProcess(): ImageState {
    if (!this.state.setZoom) {
      this.state.setZoom = this.hasResized();
    }

    if (this.state.zoomToContent) {
      LookerUtils.toggleZoom(this.state, this.currentOverlays);
    } else if (this.state.setZoom && this.state.overlaysPrepared) {
      if (this.state.options.zoom) {
        this.state = zoomToContent(this.state, this.pluckedOverlays);
      } else {
        this.state.pan = [0, 0];
        this.state.scale = 1;
      }

      this.state.setZoom = false;
    }

    return super.postProcess();
  }

  updateOptions(
    options: Partial<ImageState["options"]>,
    disableReload = false
  ) {
    const reload =
      !disableReload &&
      LookerUtils.shouldReloadSample(this.state.options, options);
    const state: Partial<ImageState> = { options };
    if (options.zoom !== undefined) {
      state.setZoom =
        this.state.options.zoom !== options.zoom || this.state.config.thumbnail;
    }

    if (reload) {
      this.updater({
        ...state,
        reloading: this.state.disabled,
        disabled: false,
      });
      this.updateSample(this.sample);
    } else {
      this.updater({ ...state, disabled: false });
    }
  }
}
