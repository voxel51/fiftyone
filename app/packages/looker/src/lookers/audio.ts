import { getAudioElements } from "../elements";
import { COMMON_SHORTCUTS } from "../elements/common";
import { DEFAULT_AUDIO_OPTIONS, Optional, AudioState } from "../state";
import { AbstractLooker } from "./abstract";
import { LookerUtils } from "./shared";

export class AudioLooker extends AbstractLooker<AudioState> {
  getElements(config) {
    return getAudioElements(config, this.updater, this.getDispatchEvent());
  }

  getInitialState(
    config: AudioState["config"],
    options: AudioState["options"]
  ) {
    options = {
      ...this.getDefaultOptions(),
      ...options,
    };

    return {
      ...this.getInitialBaseState(),
      config: { ...config },
      options,
      SHORTCUTS: COMMON_SHORTCUTS,
    };
  }

  getDefaultOptions() {
    return DEFAULT_AUDIO_OPTIONS;
  }

  hasDefaultZoom(state: AudioState, overlays: Overlay<AudioState>[]): boolean {
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

  postProcess(): AudioState {
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

  updateOptions(options: Partial<AudioState["options"]>) {
    const reload = LookerUtils.shouldReloadSample(this.state.options, options);
    const state: Partial<AudioState> = { options };
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