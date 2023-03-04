import { getFrameElements } from "../elements";
import { COMMON_SHORTCUTS } from "../elements/common";
import { Overlay } from "../overlays/base";
import { DEFAULT_FRAME_OPTIONS, FrameState, Optional } from "../state";
import { AbstractLooker } from "./abstract";
import { LookerUtils } from "./shared";

import { zoomToContent } from "../zoom";

export class FrameLooker extends AbstractLooker<FrameState> {
  getElements(config) {
    return getFrameElements(config, this.updater, this.getDispatchEvent());
  }

  getInitialState(
    config: FrameState["config"],
    options: FrameState["options"]
  ) {
    options = {
      ...this.getDefaultOptions(),
      ...options,
    };
    return {
      duration: null,
      ...this.getInitialBaseState(),
      config: { ...config },
      options,
      SHORTCUTS: COMMON_SHORTCUTS,
    };
  }

  getDefaultOptions() {
    return DEFAULT_FRAME_OPTIONS;
  }

  hasDefaultZoom(state: FrameState, overlays: Overlay<FrameState>[]): boolean {
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

  postProcess(): FrameState {
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

  updateOptions(options: Optional<FrameState["options"]>) {
    const reload = LookerUtils.shouldReloadSample(this.state.options, options);
    const state: Optional<FrameState> = { options };
    if (options.zoom !== undefined) {
      state.setZoom = this.state.options.zoom !== options.zoom;
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
