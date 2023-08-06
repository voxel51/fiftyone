import { v4 as uuid } from "uuid";
import { getVideoElements } from "../elements";
import { VIDEO_SHORTCUTS } from "../elements/common";
import { ClassificationsOverlay, loadOverlays } from "../overlays";
import { Overlay } from "../overlays/base";
import processOverlays from "../processOverlays";
import {
  BaseConfig,
  BufferRange,
  Buffers,
  Coloring,
  CustomizeColor,
  DEFAULT_VIDEO_OPTIONS,
  FrameChunkResponse,
  FrameSample,
  LabelData,
  Optional,
  StateUpdate,
  VideoConfig,
  VideoSample,
  VideoState,
} from "../state";
import { addToBuffers, createWorker, removeFromBuffers } from "../util";

import LRUCache from "lru-cache";
import { CHUNK_SIZE, MAX_FRAME_CACHE_SIZE_BYTES } from "../constants";
import { getFrameNumber } from "../elements/util";
import { AbstractLooker } from "./abstract";
import { LookerUtils } from "./shared";

interface Frame {
  sample: FrameSample;
  overlays: Overlay<VideoState>[];
}

type RemoveFrame = (frameNumber: number) => void;

interface AcquireReaderOptions {
  addFrame: (frameNumber: number, frame: Frame) => void;
  addFrameBuffers: (range: [number, number]) => void;
  removeFrame: RemoveFrame;
  getCurrentFrame: () => number;
  dataset: string;
  group: BaseConfig["group"];
  view: any[];
  sampleId: string;
  frameNumber: number;
  frameCount: number;
  update: StateUpdate<VideoState>;
  dispatchEvent: (eventType: string, detail: any) => void;
  coloring: Coloring;
  customizeColorSetting: CustomizeColor[];
}

const { acquireReader, addFrame } = (() => {
  const createCache = () =>
    new LRUCache<WeakRef<RemoveFrame>, Frame>({
      max: MAX_FRAME_CACHE_SIZE_BYTES,
      length: (frame) => {
        let size = 1;
        frame.overlays.forEach((overlay) => {
          size += overlay.getSizeBytes();
        });
        return size;
      },
      dispose: (removeFrameRef, frame) => {
        const removeFrame = removeFrameRef.deref();
        removeFrame && removeFrame(frame.sample.frame_number);
      },
    });

  const frameCache = createCache();
  let frameReader: Worker;

  let streamSize = 0;
  let nextRange: BufferRange = null;

  let requestingFrames = false;
  let currentOptions: AcquireReaderOptions = null;

  const setStream = ({
    addFrame,
    addFrameBuffers,
    removeFrame,
    frameNumber,
    frameCount,
    sampleId,
    update,
    dispatchEvent,
    coloring,
    customizeColorSetting,
    dataset,
    view,
    group,
  }: AcquireReaderOptions): string => {
    streamSize = 0;
    nextRange = [frameNumber, Math.min(frameCount, CHUNK_SIZE + frameNumber)];
    const subscription = uuid();
    frameReader && frameReader.terminate();
    frameReader = createWorker(LookerUtils.workerCallbacks, dispatchEvent);
    frameReader.onmessage = ({ data }: MessageEvent<FrameChunkResponse>) => {
      if (data.uuid !== subscription || data.method !== "frameChunk") {
        return;
      }

      const {
        frames,
        range: [start, end],
      } = data;
      addFrameBuffers([start, end]);
      for (let i = start; i <= end; i++) {
        const frame = {
          sample: {
            frame_number: i,
          },
          overlays: [],
        };
        frameCache.set(new WeakRef(removeFrame), frame);
        addFrame(i, frame);
      }

      for (let i = 0; i < frames.length; i++) {
        const frameSample = frames[i];
        const prefixedFrameSample = Object.fromEntries(
          Object.entries(frameSample).map(([k, v]) => ["frames." + k, v])
        );

        const overlays = loadOverlays(prefixedFrameSample);
        overlays.forEach((overlay) => {
          streamSize += overlay.getSizeBytes();
        });
        const frame = { sample: frameSample, overlays };
        frameCache.set(new WeakRef(removeFrame), frame);
        addFrame(frameSample.frame_number, frame);
      }

      const requestMore = streamSize < MAX_FRAME_CACHE_SIZE_BYTES;

      if (requestMore && end < frameCount) {
        nextRange = [end + 1, Math.min(frameCount, end + 1 + CHUNK_SIZE)];
        requestingFrames = true;
        frameReader.postMessage({
          method: "requestFrameChunk",
          uuid: subscription,
        });
      } else {
        requestingFrames = false;
        nextRange = null;
      }

      update((state) => {
        state.buffering && dispatchEvent("buffering", false);
        return { buffering: false };
      });
    };

    requestingFrames = true;
    frameReader.postMessage({
      method: "setStream",
      sampleId,
      frameCount,
      frameNumber,
      uuid: subscription,
      coloring,
      customizeColorSetting,
      dataset,
      view,
      group,
    });
    return subscription;
  };

  return {
    acquireReader: (
      options: AcquireReaderOptions
    ): ((frameNumber?: number) => void) => {
      currentOptions = options;
      let subscription = setStream(currentOptions);

      return (frameNumber: number, force?: boolean) => {
        if (
          force ||
          !nextRange ||
          (frameNumber < nextRange[0] && frameNumber > nextRange[1])
        ) {
          force && frameCache.reset();
          nextRange = [frameNumber, frameNumber + CHUNK_SIZE];
          subscription = setStream({ ...currentOptions, frameNumber });
        } else if (!requestingFrames) {
          frameReader.postMessage({
            method: "requestFrameChunk",
            uuid: subscription,
          });
        }
        requestingFrames = true;
      };
    },
    addFrame: (removeFrame: RemoveFrame, frame: Frame): void => {
      frameCache.set(new WeakRef(removeFrame), frame);
    },
  };
})();

let lookerWithReader: VideoLooker | null = null;

export class VideoLooker extends AbstractLooker<VideoState, VideoSample> {
  private frames: Map<number, WeakRef<Frame>> = new Map();
  private requestFrames: (frameNumber: number, force?: boolean) => void;

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

  getCurrentSampleLabels(): LabelData[] {
    const labels: LabelData[] = [];
    processOverlays(this.state, this.sampleOverlays)[0].forEach((overlay) => {
      if (overlay instanceof ClassificationsOverlay) {
        overlay.getFilteredAndFlat(this.state).forEach(([field, label]) => {
          labels.push({
            field: field,
            labelId: label.id,
            sampleId: this.sample.id,
          });
        });
      } else {
        const { id: labelId, field } = overlay.getSelectData(this.state);
        labels.push({ labelId, field, sampleId: this.sample.id });
      }
    });

    return labels;
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
    return getVideoElements(config, this.updater, this.getDispatchEvent());
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
      buffers: [[firstFrame, firstFrame]] as Buffers,
      seekBarHovering: false,
      SHORTCUTS: VIDEO_SHORTCUTS,
      hasPoster: false,
      waitingForVideo: false,
      lockedToSupport: Boolean(config.support),
    };
  }

  hasDefaultZoom(state: VideoState, overlays: Overlay<VideoState>[]): boolean {
    let pan = [0, 0];
    let scale = 1;

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
      true
    );

    const providedFrames = sample.frames?.length
      ? sample.frames
      : [{ frame_number: 1 }];
    const providedFrameOverlays = providedFrames.map((frameSample) =>
      loadOverlays(
        Object.fromEntries(
          Object.entries(frameSample).map(([k, v]) => ["frames." + k, v])
        )
      )
    );

    const frames = providedFrames.map((frameSample, i) => ({
      sample: frameSample as FrameSample,
      overlays: providedFrameOverlays[i],
    }));
    frames.forEach((frame) => {
      const frameNumber = frame.sample.frame_number;
      addFrame(
        (frameNumber) => removeFromBuffers(frameNumber, this.state.buffers),
        frame
      );
      this.frames.set(frame.sample.frame_number, new WeakRef(frame));
      addToBuffers([frameNumber, frameNumber], this.state.buffers);
    });
  }

  pluckOverlays(state: VideoState) {
    const frameNumber = state.frameNumber;
    let hideSampleOverlays = false;

    if (state.config.support && !state.lockedToSupport) {
      const [start, end] = state.config.support;
      hideSampleOverlays = frameNumber < start || frameNumber > end;
    }

    let pluckedOverlays = hideSampleOverlays ? [] : this.sampleOverlays;
    if (this.hasFrame(state.frameNumber)) {
      const frame = this.frames.get(state.frameNumber)?.deref();
      if (frame !== undefined) {
        pluckedOverlays = [...pluckedOverlays, ...frame.overlays];
      }
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
      lookerWithReader !== this &&
      frameCount !== null
    ) {
      lookerWithReader && lookerWithReader.pause();
      this.setReader();
      lookerWithReader = this;
      this.state.buffers = [[1, 1]];
    } else if (lookerWithReader !== this && frameCount) {
      this.state.buffering && this.dispatchEvent("buffering", false);
      this.state.playing = false;
      this.state.buffering = false;
    }

    if (lookerWithReader === this) {
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
      addFrameBuffers: (range) =>
        (this.state.buffers = addToBuffers(range, this.state.buffers)),
      removeFrame: (frameNumber) =>
        removeFromBuffers(frameNumber, this.state.buffers),
      getCurrentFrame: () => this.frameNumber,
      sampleId: this.state.config.sampleId,
      frameCount: getFrameNumber(
        this.state.duration,
        this.state.duration,
        this.state.config.frameRate
      ),
      frameNumber: this.state.frameNumber,
      update: this.updater,
      dispatchEvent: (event, detail) => this.dispatchEvent(event, detail),
      coloring: this.state.options.coloring,
      customizeColorSetting: this.state.options.customizeColorSetting,
      dataset: this.state.config.dataset,
      group: this.state.config.group,
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

    return super.postProcess();
  }

  updateOptions(options: Optional<VideoState["options"]>) {
    const reload = LookerUtils.shouldReloadSample(this.state.options, options);

    if (reload) {
      this.updater({ options, reloading: this.state.disabled });
      this.updateSample(this.sample);
    } else {
      this.updater({ options, disabled: false });
    }
  }

  updateSample(sample: VideoSample) {
    this.state.buffers = [[1, 1]];
    this.frames.clear();
    super.updateSample(sample);
    this.setReader();
  }

  private hasFrame(frameNumber: number) {
    return (
      this.frames.has(frameNumber) &&
      this.frames.get(frameNumber)?.deref() !== undefined
    );
  }
}
