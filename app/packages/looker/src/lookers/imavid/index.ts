import { getImaVidElements } from "../../elements";
import { VIDEO_SHORTCUTS } from "../../elements/common";
import { ImaVidElement } from "../../elements/imavid";
import {
  DEFAULT_BASE_OPTIONS,
  ImaVidOptions,
  ImaVidState,
  Sample,
} from "../../state";
import { AbstractLooker } from "../abstract";
import { LookerUtils } from "../shared";
import { BufferManager } from "./buffer-manager";
import { DEFAULT_PLAYBACK_RATE } from "./constants";

/**
 * Looker for image samples in an ordered dynamic group that are to be rendered as a video.
 *
 */
export class ImaVidLooker extends AbstractLooker<ImaVidState, Sample> {
  private elements: ReturnType<typeof getImaVidElements>;
  private unsubscribe: ReturnType<typeof this.subscribeToState>;

  init() {
    // subscribe to frame number and update sample when frame number changes
    this.unsubscribe = this.subscribeToState("currentFrameNumber", () => {
      this.thisFrameSample?.sample &&
        this.updateSample(this.thisFrameSample.sample);
    });
  }

  get thisFrameSample() {
    return this.frameStoreController.store.getSampleAtFrame(this.frameNumber);
  }

  get frameNumber() {
    return this.state.currentFrameNumber;
  }

  get frameStoreController() {
    return this.state.config?.frameStoreController;
  }

  get playing() {
    return this.state.playing;
  }

  get element() {
    return this.elements.children[0] as ImaVidElement;
  }

  destroy() {
    this.unsubscribe && this.unsubscribe();
    this.frameStoreController.pauseFetch();
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
    const firstFrame = config.firstFrameNumber ?? 1;

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

  getDefaultOptions(): ImaVidOptions {
    return {
      ...DEFAULT_BASE_OPTIONS,
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

  updateOptions(options: Partial<ImaVidState["options"]>) {
    const reload = LookerUtils.shouldReloadSample(this.state.options, options);

    if (reload) {
      this.updater({ options, reloading: this.state.disabled });
      this.updateSample(this.sample);
    } else {
      this.updater({ options, disabled: false });
    }
  }
}
