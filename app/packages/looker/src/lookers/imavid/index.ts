import { getImaVidElements } from "../../elements";
import { VIDEO_SHORTCUTS } from "../../elements/common";
import { ImaVidElement } from "../../elements/imavid";
import { Overlay } from "../../overlays/base";
import { ImaVidOptions, ImaVidState, LabelData, Sample } from "../../state";

import { AbstractLooker } from "../abstract";
import { LookerUtils } from "../shared";
import { BufferManager } from "./buffer-manager";
import { DEFAULT_PLAYBACK_RATE } from "./constants";

interface ImaVidFrame {
  sample: Sample;
  overlays: Overlay<ImaVidState>[];
}

/**
 * Looker for image samples in an ordered dynamic group that are to be rendered as a video.
 *
 * @remarks
 * 1. Max fps offered is 24.
 * Because images are dynamically fetched, max
 * 2. adfadsf
 */
export class ImaVidLooker extends AbstractLooker<ImaVidState, Sample> {
  private frames: Map<number, WeakRef<ImaVidFrame>> = new Map();

  private elements: ReturnType<typeof getImaVidElements>;

  get firstSample() {
    return this.sample;
  }

  get frameNumber() {
    return this.state.currentFrameNumber;
  }

  get _UNSAFE_state() {
    return this.state;
  }

  get playing() {
    return this.state.playing;
  }

  get element() {
    return this.elements.children[0] as ImaVidElement;
  }

  destroy() {
    this.pause();
    super.destroy();
  }

  dispatchImpliedEvents(
    previousState: Readonly<ImaVidState>,
    state: Readonly<ImaVidState>
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
    // if (frame) {
    //   processOverlays(this.state, frame.overlays)[0].forEach((overlay) => {
    //     if (overlay instanceof ClassificationsOverlay) {
    //       overlay.getFilteredAndFlat(this.state).forEach(([field, label]) => {
    //         labels.push({
    //           field: field,
    //           labelId: label.id,
    //           frameNumber: this.frameNumber,
    //           sampleId: this.sample.id,
    //         });
    //       });
    //     } else {
    //       const { id: labelId, field } = overlay.getSelectData(this.state);
    //       labels.push({
    //         labelId,
    //         field,
    //         sampleId: this.sample.id,
    //         frameNumber: this.frameNumber,
    //       });
    //     }
    //   });
    // }

    return labels;
  }

  getElements(config) {
    const elements = getImaVidElements(
      config,
      this.updater.bind(this),
      this.getDispatchEvent(),
      this.batchUpdater.bind(this)
    );
    this.elements = elements;
    return elements;
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
      seeking: false,
      playing: false,
      currentFrameNumber: firstFrame,
      isCurrentFrameNumberAuthoritative: false,
      totalFrames: config.frameStoreController.totalFrameCount ?? 1,
      buffering: false,
      bufferManager: new BufferManager([[firstFrame, firstFrame]]),
      seekBarHovering: false,
      SHORTCUTS: VIDEO_SHORTCUTS,
    };
  }

  hasDefaultZoom(state: ImaVidState): boolean {
    let pan = [0, 0];
    let scale = 1;

    return (
      scale === state.scale &&
      pan[0] === state.pan[0] &&
      pan[1] === state.pan[1]
    );
  }

  getDefaultOptions() {
    return {
      loop: false,
      playbackRate: DEFAULT_PLAYBACK_RATE,
    } as ImaVidOptions;
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
    // if (this.state.seeking) {
    //   this.state.disableOverlays = true;
    // } else if (!this.state.playing && !this.state.buffering) {
    //   this.state.disableOverlays = false;
    // }
    // if (!this.state.setZoom) {
    //   this.state.setZoom = this.hasResized();
    // }

    // if (!this.state.setZoom) {
    //   this.state.setZoom = this.hasResized();
    // }

    // if (this.state.zoomToContent) {
    //   LookerUtils.toggleZoom(this.state, this.currentOverlays);
    // } else if (this.state.setZoom) {
    //   this.state.pan = [0, 0];
    //   this.state.scale = 1;

    //   this.state.setZoom = false;
    // }

    return super.postProcess();
  }

  updateOptions(options: Partial<ImaVidState["options"]>) {
    const reload = LookerUtils.shouldReloadSample(this.state.options, options);

    if (reload) {
      this.updater({ options, reloading: this.state.disabled });
      this.updateSample(this.sample);
    } else {
      this.updater({ options, disabled: false });
    }
  }

  private hasFrame(frameNumber: number) {
    return (
      this.frames.has(frameNumber) &&
      this.frames.get(frameNumber)?.deref() !== undefined
    );
  }
}
