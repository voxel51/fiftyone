import { setFrameNumberAtom } from "@fiftyone/playback";
import { jotaiStore } from "@fiftyone/state/src/jotai";
import { getVideoElements } from "../elements";
import { VIDEO_SHORTCUTS } from "../elements/common";
import { getFrameNumber } from "../elements/util";
import { ClassificationsOverlay, loadOverlays } from "../overlays";
import type { Overlay } from "../overlays/base";
import processOverlays from "../processOverlays";
import type {
  Buffers,
  FrameSample,
  LabelData,
  VideoConfig,
  VideoSample,
  VideoState,
} from "../state";
import { DEFAULT_VIDEO_OPTIONS } from "../state";
import { addToBuffers, removeFromBuffers } from "../util";
import { AbstractLooker } from "./abstract";
import { type Frame, acquireReader, clearReader } from "./frame-reader";
import { LookerUtils, withFrames } from "./shared";
import { hasFrame } from "./utils";

let LOOKER_WITH_READER: VideoLooker | null = null;

export class VideoLooker extends AbstractLooker<VideoState, VideoSample> {
  private firstFrame: Frame;
  private firstFrameNumber: number;
  private frames: Map<number, WeakRef<Frame>> = new Map();
  private requestFrames: (frameNumber: number) => void;

  get frameNumber() {
    return this.state.frameNumber;
  }

  get playing() {
    return this.state.playing;
  }

  get waiting() {
    const video = this.lookerElement.children[0].element as HTMLVideoElement;
    return (
      video &&
      (video.seeking ||
        video.readyState < 2 ||
        !this.hasFrame(this.state.frameNumber))
    );
  }

  detach() {
    this.pause();
    if (LOOKER_WITH_READER === this) {
      clearReader();
      LOOKER_WITH_READER = null;
      this.state.buffers = this.initialBuffers(this.state.config);
    }
    super.detach();
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

  getCurrentSampleLabels(): LabelData[] {
    const labels: LabelData[] = [];
    for (const overlay of processOverlays(this.state, this.sampleOverlays)[0]) {
      if (overlay instanceof ClassificationsOverlay) {
        for (const [field, label] of overlay.getFilteredAndFlat(this.state)) {
          labels.push({
            field: field,
            labelId: label.id,
            sampleId: this.sample.id,
          });
        }
      } else {
        const { id: labelId, field } = overlay.getSelectData(this.state);
        labels.push({ labelId, field, sampleId: this.sample.id });
      }
    }

    return labels;
  }

  getCurrentFrameLabels(): LabelData[] {
    const frame = this.frames.get(this.frameNumber).deref();
    if (!frame) {
      return [];
    }
    const labels: LabelData[] = [];

    for (const overlay of processOverlays(this.state, frame.overlays)[0]) {
      if (overlay instanceof ClassificationsOverlay) {
        for (const [field, label] of overlay.getFilteredAndFlat(this.state)) {
          labels.push({
            field: field,
            labelId: label.id,
            frameNumber: this.frameNumber,
            sampleId: this.sample.id,
          });
        }
      } else {
        const { id: labelId, field } = overlay.getSelectData(this.state);
        labels.push({
          labelId,
          field,
          sampleId: this.sample.id,
          frameNumber: this.frameNumber,
        });
      }
    }

    return labels;
  }

  getElements(config) {
    return getVideoElements({
      abortController: this.abortController,
      config,
      dispatchEvent: this.getDispatchEvent(),
      update: this.updater,
    });
  }

  getInitialState(
    config: VideoState["config"],
    options: VideoState["options"]
  ): VideoState {
    const firstFrame = config.support ? config.support[0] : 1;

    return {
      duration: null,
      seeking: false,
      fragment: null,
      playing: false,
      frameNumber: firstFrame,
      buffering: false,
      ...this.getInitialBaseState(),
      config: { ...config },
      options: {
        ...this.getDefaultOptions(),
        ...options,
      },
      buffers: this.initialBuffers(config),
      seekBarHovering: false,
      SHORTCUTS: VIDEO_SHORTCUTS,
      hasPoster: false,
      waitingForVideo: false,
      waitingToStream: false,
      lockedToSupport: Boolean(config.support),
    };
  }

  hasDefaultZoom(state: VideoState, overlays: Overlay<VideoState>[]): boolean {
    const pan = [0, 0];
    const scale = 1;

    return (
      scale === state.scale &&
      pan[0] === state.pan[0] &&
      pan[1] === state.pan[1]
    );
  }

  loadOverlays(sample: VideoSample) {
    this.sampleOverlays = loadOverlays(
      Object.fromEntries(
        Object.entries(sample).filter(([fieldName]) => fieldName !== "frames")
      ),
      this.state.config.fieldSchema,
      true
    );
    const [firstFrameData] = sample.frames?.length
      ? sample.frames
      : [{ frame_number: 1 }];
    const firstFrameOverlays = loadOverlays(
      withFrames(firstFrameData),
      this.state.config.fieldSchema
    );
    const firstFrame = {
      sample: firstFrameData as FrameSample,
      overlays: firstFrameOverlays,
    };
    this.firstFrame = firstFrame;
    this.firstFrameNumber = firstFrameData.frame_number;
    const frameNumber = firstFrame.sample.frame_number;
    this.frames.set(firstFrame.sample.frame_number, new WeakRef(firstFrame));
    addToBuffers([frameNumber, frameNumber], this.state.buffers);
  }

  pluckOverlays(state: VideoState) {
    const frameNumber = state.frameNumber;
    let hideSampleOverlays = false;

    if (state.config.support && !state.lockedToSupport) {
      const [start, end] = state.config.support;
      hideSampleOverlays = frameNumber < start || frameNumber > end;
    }

    let pluckedOverlays = hideSampleOverlays ? [] : this.sampleOverlays;
    const frame = this.getFrame(state.frameNumber);
    if (frame) {
      pluckedOverlays = [...pluckedOverlays, ...frame.overlays];
    }

    let frameCount = null;

    if (this.state.duration !== null) {
      frameCount = getFrameNumber(
        this.state.duration,
        this.state.duration,
        this.state.config.frameRate
      );
    }

    if (
      (!state.config.thumbnail || state.playing) &&
      LOOKER_WITH_READER !== this &&
      frameCount !== null
    ) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      LOOKER_WITH_READER = this;
      this.setReader();
    } else if (LOOKER_WITH_READER !== this && frameCount) {
      this.state.buffering && this.dispatchEvent("buffering", false);
      this.state.playing = false;
      this.state.buffering = false;
    }

    if (LOOKER_WITH_READER === this) {
      if (this.hasFrame(Math.min(frameCount, state.frameNumber + 1))) {
        this.state.buffering && this.dispatchEvent("buffering", false);
        this.state.buffering = false;
      } else {
        this.state.buffering = true;
        this.dispatchEvent("buffering", true);
        this.requestFrames(state.frameNumber);
      }
    }

    return pluckedOverlays;
  }

  private setReader() {
    this.requestFrames = acquireReader({
      addFrame: (frameNumber, frame) =>
        this.frames.set(frameNumber, new WeakRef(frame)),
      addFrameBuffers: (range) => {
        this.state.buffers = addToBuffers(range, this.state.buffers);
      },
      activePaths: this.state.options.activePaths,
      coloring: this.state.options.coloring,
      customizeColorSetting: this.state.options.customizeColorSetting,
      dispatchEvent: (event, detail) => this.dispatchEvent(event, detail),
      dataset: this.state.config.dataset,
      frameCount: getFrameNumber(
        this.state.duration,
        this.state.duration,
        this.state.config.frameRate
      ),
      frameNumber: this.state.frameNumber,
      getCurrentFrame: () => this.frameNumber,
      group: this.state.config.group,
      removeFrame: (frameNumber) =>
        removeFromBuffers(frameNumber, this.state.buffers),
      sampleId: this.state.config.sampleId,
      schema: this.state.config.fieldSchema,
      update: this.updater,
      view: this.state.config.view,
    });
  }

  getSample(): Promise<VideoSample> {
    return new Promise((resolve) => {
      const resolver = (sample) => {
        if (this.hasFrame(this.state.frameNumber)) {
          resolve({
            ...sample,
            frames: [
              {
                frame_number: this.frameNumber,
                ...{
                  filter: this.state.options.filter,
                  value: {
                    ...this.frames.get(this.frameNumber).deref().sample,
                  },
                  schema: this.state.config.fieldSchema.frames.fields,
                  keys: ["frames"],
                  active: this.state.options.activePaths,
                },
              },
            ],
          });
          return;
        }
        setTimeout(resolver, 200);
      };
      super.getSample().then(resolver);
    });
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

  postProcess(): VideoState {
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

    if (this.state.config.enableTimeline) {
      jotaiStore.set(setFrameNumberAtom, {
        name: `timeline-${this.state.config.sampleId}`,
        newFrameNumber: this.state.frameNumber,
      });
    }

    if (LOOKER_WITH_READER === this) {
      if (this.state.config.thumbnail && !this.state.hovering) {
        clearReader();
        this.state.buffers = this.initialBuffers(this.state.config);
        LOOKER_WITH_READER = null;
      }
    }

    return super.postProcess();
  }

  updateOptions(options: Partial<VideoState["options"]>) {
    const reload = LookerUtils.shouldReloadSample(this.state.options, options);

    if (reload) {
      this.updater({ options, reloading: this.state.disabled });
      this.updateSample(this.sample);
    } else {
      this.updater({ options, disabled: false });
    }
  }

  updateSample(sample: VideoSample) {
    if (LOOKER_WITH_READER === this) {
      LOOKER_WITH_READER?.pause();
      LOOKER_WITH_READER = null;
    }

    this.frames = new Map();
    this.state.buffers = this.initialBuffers(this.state.config);
    super.updateSample(sample);
  }

  getVideo() {
    return this.lookerElement.children[0].element as HTMLVideoElement;
  }

  private hasFrame(frameNumber: number) {
    return hasFrame(this.state.buffers, frameNumber);
  }

  private getFrame(frameNumber: number) {
    if (frameNumber === this.firstFrameNumber) {
      return this.firstFrame;
    }

    return this.frames.get(frameNumber)?.deref();
  }

  private initialBuffers(config: VideoConfig) {
    const firstFrame = config.support ? config.support[0] : 1;
    return [[firstFrame, firstFrame]] as Buffers;
  }
}
