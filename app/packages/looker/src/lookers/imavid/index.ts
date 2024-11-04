import { BufferManager } from "@fiftyone/utilities";
import { getImaVidElements } from "../../elements";
import { IMAVID_SHORTCUTS } from "../../elements/common/actions";
import { ImaVidElement } from "../../elements/imavid";
import {
  DEFAULT_BASE_OPTIONS,
  ImaVidOptions,
  ImaVidState,
  Sample,
} from "../../state";
import { AbstractLooker } from "../abstract";
import { LookerUtils } from "../shared";
import {
  DEFAULT_PLAYBACK_RATE,
  IMAVID_PLAYBACK_RATE_LOCAL_STORAGE_KEY,
} from "./constants";

export { BUFFERING_PAUSE_TIMEOUT } from "./constants";

const DEFAULT_PAN = 0;
const DEFAULT_SCALE = 1;
const FIRST_FRAME = 1;

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
    return this.lookerElement.children[0] as ImaVidElement;
  }

  get config() {
    return this.state.config;
  }

  get options() {
    return this.state.options;
  }

  destroy() {
    this.unsubscribe?.();
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
    const elements = getImaVidElements({
      abortController: this.abortController,
      batchUpdate: this.batchUpdater.bind(this),
      config,
      update: this.updater.bind(this),
      dispatchEvent: this.getDispatchEvent(),
    });
    this.elements = elements;
    return elements;
  }

  getInitialState(
    config: ImaVidState["config"],
    options: ImaVidState["options"]
  ): ImaVidState {
    return {
      ...this.getInitialBaseState(),
      options: {
        ...this.getDefaultOptions(),
        ...options,
      },
      config: { ...config },
      seeking: false,
      playing: false,
      currentFrameNumber: FIRST_FRAME,
      totalFrames: config.frameStoreController.totalFrameCount ?? 1,
      buffering: false,
      bufferManager: new BufferManager([[FIRST_FRAME, FIRST_FRAME]]),
      seekBarHovering: false,
      SHORTCUTS: IMAVID_SHORTCUTS,
    };
  }

  hasDefaultZoom(state: ImaVidState): boolean {
    return (
      DEFAULT_SCALE === state.scale &&
      DEFAULT_PAN === state.pan[0] &&
      DEFAULT_PAN === state.pan[1]
    );
  }

  getDefaultOptions(): ImaVidOptions {
    let defaultPlaybackRate = DEFAULT_PLAYBACK_RATE;

    const mayBePlayBackRateFromLocalStorage = localStorage.getItem(
      IMAVID_PLAYBACK_RATE_LOCAL_STORAGE_KEY
    );

    if (mayBePlayBackRateFromLocalStorage) {
      defaultPlaybackRate = parseFloat(mayBePlayBackRateFromLocalStorage);
    }

    return {
      ...DEFAULT_BASE_OPTIONS,
      loop: true,
      playbackRate: defaultPlaybackRate,
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
