import { getImaVidElements } from "../../elements";
import { VIDEO_SHORTCUTS } from "../../elements/common";
import { ClassificationsOverlay } from "../../overlays";
import { Overlay } from "../../overlays/base";
import processOverlays from "../../processOverlays";
import {
  Buffers,
  DEFAULT_VIDEO_OPTIONS,
  ImaVidState,
  LabelData,
  Optional,
  Sample,
  VideoSample,
  VideoState,
} from "../../state";

import { AbstractLooker } from "../abstract";
import { LookerUtils } from "../shared";

interface ImaVidFrame {
  sample: Sample;
  overlays: Overlay<ImaVidState>[];
}

export class ImaVidLooker extends AbstractLooker<ImaVidState, Sample> {
  private frames: Map<number, WeakRef<ImaVidFrame>> = new Map();

  get firstSample() {
    return this.sample;
  }

  get frameNumber() {
    return this.state.frameNumber;
  }

  get playing() {
    return this.state.playing;
  }

  destroy() {
    this.pause();
    super.destroy();
  }

  dispatchImpliedEvents(
    previousState: Readonly<VideoState>,
    state: Readonly<VideoState>
  ): void {
    super.dispatchImpliedEvents(previousState, state);
    const previousPlaying = previousState.playing && !previousState.buffering;
    const playing = state.playing && !state.buffering;

    if (previousPlaying !== playing) {
      playing && this.dispatchEvent("play", null);
      !playing && this.dispatchEvent("pause", { buffering: state.buffering });
    }
  }

  getCurrentFrameLabels(): LabelData[] {
    const frame = this.frames.get(this.frameNumber).deref();
    const labels: LabelData[] = [];
    if (frame) {
      processOverlays(this.state, frame.overlays)[0].forEach((overlay) => {
        if (overlay instanceof ClassificationsOverlay) {
          overlay.getFilteredAndFlat(this.state).forEach(([field, label]) => {
            labels.push({
              field: field,
              labelId: label.id,
              frameNumber: this.frameNumber,
              sampleId: this.sample.id,
            });
          });
        } else {
          const { id: labelId, field } = overlay.getSelectData(this.state);
          labels.push({
            labelId,
            field,
            sampleId: this.sample.id,
            frameNumber: this.frameNumber,
          });
        }
      });
    }

    return labels;
  }

  getElements(config) {
    return getImaVidElements(config, this.updater, this.getDispatchEvent());
  }

  getInitialState(
    config: ImaVidState["config"],
    options: ImaVidState["options"]
  ): ImaVidState {
    const firstFrame = 1;

    return {
      ...this.getInitialBaseState(),
      options: {
        ...this.getDefaultOptions(),
        ...options,
      },
      config: { ...config },
      duration: null,
      seeking: false,
      playing: false,
      frameNumber: firstFrame,
      buffering: false,
      buffers: [[firstFrame, firstFrame]] as Buffers,
      seekBarHovering: false,
      SHORTCUTS: VIDEO_SHORTCUTS,
      hasPoster: false,
      waitingForVideo: false,
    };
  }

  hasDefaultZoom(state: VideoState): boolean {
    let pan = [0, 0];
    let scale = 1;

    return (
      scale === state.scale &&
      pan[0] === state.pan[0] &&
      pan[1] === state.pan[1]
    );
  }

  loadOverlays(sample: VideoSample) {
    console.log(
      "imavid: loading overlays for sample ...",
      sample.filepath.slice(-10)
    );
  }

  pluckOverlays(state: VideoState) {
    console.log("imavid: plucking overlays");
    return [];
  }

  getDefaultOptions() {
    return DEFAULT_VIDEO_OPTIONS;
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

  postProcess() {
    if (this.state.seeking) {
      this.state.disableOverlays = true;
    } else if (!this.state.playing && !this.state.buffering) {
      this.state.disableOverlays = false;
    }
    if (!this.state.setZoom) {
      this.state.setZoom = this.hasResized();
    }

    if (!this.state.setZoom) {
      this.state.setZoom = this.hasResized();
    }

    if (this.state.zoomToContent) {
      LookerUtils.toggleZoom(this.state, this.currentOverlays);
    } else if (this.state.setZoom) {
      this.state.pan = [0, 0];
      this.state.scale = 1;

      this.state.setZoom = false;
    }

    return super.postProcess();
  }

  updateOptions(options: Optional<ImaVidState["options"]>) {
    const reload = LookerUtils.shouldReloadSample(this.state.options, options);

    if (reload) {
      this.updater({ options, reloading: this.state.disabled });
      this.updateSample(this.sample);
    } else {
      this.updater({ options, disabled: false });
    }
  }

  updateSample(sample: Sample) {
    this.state.buffers = [[1, 1]];
    this.frames.clear();
    super.updateSample(sample);
  }

  private hasFrame(frameNumber: number) {
    return (
      this.frames.has(frameNumber) &&
      this.frames.get(frameNumber)?.deref() !== undefined
    );
  }
}
