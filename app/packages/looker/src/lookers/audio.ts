import { getAudioElements } from "../elements";
import { COMMON_SHORTCUTS } from "../elements/common";
import { VIDEO_SHORTCUTS } from "../elements/common";
import type { Overlay } from "../overlays/base";
import type { AudioState } from "../state";
import { DEFAULT_AUDIO_OPTIONS } from "../state";
import { AbstractLooker } from "./abstract";

export class AudioLooker extends AbstractLooker<AudioState> {
  getElements(config) {
    return getAudioElements({
      abortController: this.abortController,
      config,
      dispatchEvent: this.getDispatchEvent(),
      update: this.updater,
    });
  }

  getInitialState(
    config: AudioState["config"],
    options: AudioState["options"]
  ): AudioState {
    return {
      duration: null,
      seeking: false,
      playing: false,
      buffering: false,
      ...this.getInitialBaseState(),
      config: { ...config },
      options: {
        ...this.getDefaultOptions(),
        ...options,
      },
      seekBarHovering: false,
      SHORTCUTS: VIDEO_SHORTCUTS, // Reuse video shortcuts for play/pause/seek
    };
  }

  getDefaultOptions() {
    return DEFAULT_AUDIO_OPTIONS;
  }

  hasDefaultZoom(state: AudioState, overlays: Overlay<AudioState>[]): boolean {
    // Audio waveform zoom logic could be added here
    return true;
  }

  play(): void {
    this.updater(({ playing }) => {
      if (!playing) {
        return { playing: true };
      }
      return {};
    });
  }

  pause(): void {
    this.updater(({ playing }) => {
      if (playing) {
        return { playing: false };
      }
      return {};
    });
  }

  updateOptions(
    options: Partial<AudioState["options"]>,
    disableReload = false
  ) {
    const reload = false; // Audio usually doesn't need reload for options changes

    if (reload) {
      this.updater({ options, reloading: this.state.disabled });
      this.updateSample(this.sample);
    } else {
      this.updater({ options, disabled: false });
    }
  }
}
