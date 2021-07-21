/**
 * Copyright 2017-2021, Voxel51, Inc.
 */
import LRU from "lru-cache";
import { v4 as uuid } from "uuid";

import {
  FONT_SIZE,
  STROKE_WIDTH,
  PAD,
  POINT_RADIUS,
  MAX_FRAME_CACHE_SIZE_BYTES,
  CHUNK_SIZE,
  DASH_LENGTH,
} from "./constants";
import {
  getFrameElements,
  getImageElements,
  getVideoElements,
} from "./elements";
import { LookerElement } from "./elements/common";
import processOverlays from "./processOverlays";
import { ClassificationsOverlay, loadOverlays } from "./overlays";
import { CONTAINS, Overlay } from "./overlays/base";
import {
  FrameState,
  ImageState,
  VideoState,
  StateUpdate,
  BaseState,
  DEFAULT_FRAME_OPTIONS,
  DEFAULT_IMAGE_OPTIONS,
  DEFAULT_VIDEO_OPTIONS,
  Coordinates,
  Optional,
  BaseSample,
  FrameChunkResponse,
  VideoSample,
  FrameSample,
  Buffers,
  LabelData,
  BufferRange,
} from "./state";
import {
  addToBuffers,
  createWorker,
  getElementBBox,
  getFitRect,
  mergeUpdates,
  removeFromBuffers,
  snapBox,
} from "./util";

import { zoomToContent } from "./zoom";

import { getFrameNumber } from "./elements/util";

export { zoomAspectRatio } from "./zoom";

const labelsWorker = createWorker();

type ImageSource = HTMLImageElement | HTMLVideoElement;

export abstract class Looker<
  State extends BaseState = BaseState,
  Sample extends BaseSample = BaseSample
> {
  private eventTarget: EventTarget;
  protected lookerElement: LookerElement<State>;
  private resizeObserver: ResizeObserver;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private previousState?: Readonly<State>;

  protected currentOverlays: Overlay<State>[];
  protected pluckedOverlays: Overlay<State>[];
  protected imageSource: ImageSource;
  protected sample: Sample;
  protected state: State;
  protected readonly updater: StateUpdate<State>;

  constructor(
    sample: Sample,
    config: State["config"],
    options: Optional<State["options"]>
  ) {
    this.sample = sample;
    this.loadSample(sample);
    this.eventTarget = new EventTarget();
    this.updater = this.makeUpdate();
    this.state = this.getInitialState(config, options);
    this.pluckedOverlays = [];
    this.currentOverlays = [];
    this.lookerElement = this.getElements();
    this.canvas = this.lookerElement.children[1].element as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d");
    this.imageSource = this.lookerElement.children[0].element as ImageSource;
    this.resizeObserver = new ResizeObserver(() =>
      requestAnimationFrame(() =>
        this.updater({ windowBBox: getElementBBox(this.lookerElement.element) })
      )
    );
  }

  protected dispatchEvent(eventType: string, detail: any): void {
    this.eventTarget.dispatchEvent(new CustomEvent(eventType, { detail }));
  }

  protected dispatchImpliedEvents(
    previousState: Readonly<State>,
    state: Readonly<State>
  ): void {}

  protected getDispatchEvent(): (eventType: string, detail: any) => void {
    return (eventType: string, detail: any) => {
      this.dispatchEvent(eventType, detail);
    };
  }

  private makeUpdate(): StateUpdate<State> {
    return (stateOrUpdater, postUpdate) => {
      const updates =
        stateOrUpdater instanceof Function
          ? stateOrUpdater(this.state)
          : stateOrUpdater;
      if (
        !this.lookerElement ||
        (Object.keys(updates).length === 0 && !postUpdate)
      ) {
        return;
      }

      this.previousState = this.state;
      this.state = mergeUpdates(this.state, updates);

      if (!this.state.windowBBox) {
        return;
      }

      this.pluckedOverlays = this.pluckOverlays(this.state);
      [this.currentOverlays, this.state.rotate] = processOverlays(
        this.state,
        this.pluckedOverlays
      );

      this.state = this.postProcess();
      this.state.mouseIsOnOverlay =
        Boolean(this.currentOverlays.length) &&
        this.currentOverlays[0].containsPoint(this.state) > CONTAINS.NONE;
      postUpdate && postUpdate(this.state, this.currentOverlays);

      this.dispatchImpliedEvents(this.previousState, this.state);

      this.lookerElement.render(this.state as Readonly<State>);

      if (this.state.options.showJSON) {
        const pre = this.lookerElement.element.querySelectorAll("pre")[0];
        this.getSample().then((sample) => {
          pre.innerText = JSON.stringify(sample, null, 4);
        });
      }
      const ctx = this.ctx;
      if (!this.state.loaded) {
        return;
      }

      if (this.waiting) {
        return;
      }

      ctx.lineWidth = this.state.strokeWidth;
      ctx.font = `bold ${this.state.fontSize.toFixed(2)}px Palanquin`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.state.windowBBox[2], this.state.windowBBox[3]);

      ctx.translate(...this.state.pan);
      ctx.scale(this.state.scale, this.state.scale);

      const [tlx, tly, w, h] = this.state.canvasBBox;
      ctx.drawImage(
        this.imageSource,
        0,
        0,
        this.state.config.dimensions[0],
        this.state.config.dimensions[1],
        tlx,
        tly,
        w,
        h
      );

      const numOverlays = this.currentOverlays.length;
      for (let index = numOverlays - 1; index >= 0; index--) {
        this.currentOverlays[index].draw(ctx, this.state);
      }
    };
  }

  addEventListener(
    eventType: string,
    handler: EventListenerOrEventListenerObject | null,
    ...args: any[]
  ) {
    this.eventTarget.addEventListener(eventType, handler, ...args);
  }

  removeEventListener(
    eventType: string,
    handler: EventListenerOrEventListenerObject | null,
    ...args: any[]
  ) {
    this.eventTarget.removeEventListener(eventType, handler, ...args);
  }

  attach(element: HTMLElement | string): void {
    if (typeof element === "string") {
      element = document.getElementById(element);
    }

    this.updater({ windowBBox: getElementBBox(element) });
    element.appendChild(this.lookerElement.element);
    this.resizeObserver.observe(this.lookerElement.element);
  }

  detach(): void {
    this.resizeObserver.unobserve(this.lookerElement.element);
    this.lookerElement.element.parentNode &&
      this.lookerElement.element.parentNode.removeChild(
        this.lookerElement.element
      );
  }

  destroy(): void {
    this.detach();
    delete this.lookerElement;
  }

  abstract updateOptions(options: Optional<State["options"]>): void;

  updateSample(sample: Sample) {
    this.loadSample(sample);
  }

  getSample(): Promise<Sample> {
    let sample = { ...this.sample };

    console.log(Object.keys(sample), this.state.options.fieldsMap);
    for (const field in sample) {
      if (this.state.options.fieldsMap.hasOwnProperty(field)) {
        sample[this.state.options.fieldsMap[field]] = sample[field];
        delete sample[field];
      } else if (field.startsWith("_")) {
        delete sample[field];
      }
    }

    return Promise.resolve(sample);
  }

  getCurrentSampleLabels(): LabelData[] {
    const labels: LabelData[] = [];
    this.currentOverlays.forEach((overlay) => {
      if (overlay instanceof ClassificationsOverlay) {
        overlay.getFilteredAndFlat(this.state).forEach(([field, label]) => {
          labels.push({
            field: field,
            label_id: label._id,
            sample_id: this.sample._id,
          });
        });
      } else {
        const { id: label_id, field } = overlay.getSelectData(this.state);
        labels.push({ label_id, field, sample_id: this.sample._id });
      }
    });

    return labels;
  }

  protected get waiting() {
    return false;
  }

  protected abstract hasDefaultZoom(
    state: State,
    overlays: Overlay<State>[]
  ): boolean;

  protected abstract getElements(): LookerElement<State>;

  protected abstract loadOverlays(sample: BaseSample): void;

  protected abstract pluckOverlays(state: State): Overlay<State>[];

  protected abstract getDefaultOptions(): State["options"];

  protected abstract getInitialState(
    config: State["config"],
    options: Optional<State["options"]>
  ): State;

  protected getInitialBaseState(): Omit<BaseState, "config" | "options"> {
    return {
      cursorCoordinates: [0, 0],
      pixelCoordinates: [0, 0],
      relativeCoordinates: [0, 0],
      disableControls: false,
      hovering: false,
      hoveringControls: false,
      showControls: false,
      showHelp: false,
      showOptions: false,
      loaded: false,
      scale: 1,
      pan: <Coordinates>[0, 0],
      rotate: 0,
      panning: false,
      strokeWidth: STROKE_WIDTH,
      dashLength: DASH_LENGTH,
      fontSize: FONT_SIZE,
      wheeling: false,
      transformedWindowBBox: null,
      windowBBox: null,
      transformedMediaBBox: null,
      mediaBBox: null,
      canvasBBox: null,
      textPad: PAD,
      pointRadius: POINT_RADIUS,
      mouseIsOnOverlay: false,
      overlaysPrepared: false,
      disableOverlays: false,
      zoomToContent: false,
      setZoom: true,
      hasDefaultZoom: true,
    };
  }

  protected postProcess(): State {
    let [tlx, tly, w, h] = this.state.windowBBox;
    this.state.pan = snapBox(
      this.state.scale,
      this.state.pan,
      [w, h],
      this.state.config.dimensions
    );
    this.state.mediaBBox = getFitRect(
      this.state.config.dimensions,
      this.state.windowBBox
    );
    this.state.transformedWindowBBox = [
      tlx + this.state.pan[0],
      tly + this.state.pan[1],
      this.state.scale * w,
      this.state.scale * h,
    ];

    this.state.transformedMediaBBox = getFitRect(
      this.state.config.dimensions,
      this.state.transformedWindowBBox
    );
    this.state.canvasBBox = [
      this.state.mediaBBox[0] - this.state.windowBBox[0],
      this.state.mediaBBox[1] - this.state.windowBBox[1],
      this.state.mediaBBox[2],
      this.state.mediaBBox[3],
    ];
    this.state.relativeCoordinates = [
      (this.state.cursorCoordinates[0] - this.state.transformedMediaBBox[0]) /
        this.state.transformedMediaBBox[2],
      (this.state.cursorCoordinates[1] - this.state.transformedMediaBBox[1]) /
        this.state.transformedMediaBBox[3],
    ];
    this.state.pixelCoordinates = [
      this.state.relativeCoordinates[0] * this.state.config.dimensions[0],
      this.state.relativeCoordinates[1] * this.state.config.dimensions[1],
    ];
    this.state.fontSize = FONT_SIZE / this.state.scale;
    this.state.pointRadius = POINT_RADIUS / this.state.scale;
    this.state.strokeWidth = STROKE_WIDTH / this.state.scale;
    this.state.dashLength = DASH_LENGTH / this.state.scale;
    this.state.config.thumbnail && (this.state.strokeWidth /= 2);
    this.state.textPad = PAD / this.state.scale;

    this.state.hasDefaultZoom = this.hasDefaultZoom(
      this.state,
      this.pluckedOverlays
    );

    return this.state;
  }

  protected hasResized(): boolean {
    return Boolean(
      !this.previousState?.windowBBox ||
        !this.state?.windowBBox ||
        this.previousState.windowBBox.some(
          (v, i) => v !== this.state.windowBBox[i]
        )
    );
  }

  private loadSample(sample: Sample) {
    this.sample = sample;
    const messageUUID = uuid();
    const listener = ({ data: { sample, uuid } }) => {
      if (uuid === messageUUID) {
        this.loadOverlays(sample);
        this.updater({ overlaysPrepared: true });
        labelsWorker.removeEventListener("message", listener);
      }
    };
    labelsWorker.addEventListener("message", listener);
    labelsWorker.postMessage({
      method: "processSample",
      origin: window.location.origin,
      sample,
      uuid: messageUUID,
    });
  }
}

export class FrameLooker extends Looker<FrameState> {
  private overlays: Overlay<FrameState>[];

  constructor(
    sample: BaseSample,
    config: FrameState["config"],
    options: FrameState["options"]
  ) {
    super(sample, config, options);
    this.overlays = [];
  }

  getElements() {
    return getFrameElements(this.updater, this.getDispatchEvent());
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

  loadOverlays(sample: BaseSample) {
    this.overlays = loadOverlays(sample);
  }

  pluckOverlays() {
    return this.overlays;
  }

  postProcess(): FrameState {
    if (!this.state.setZoom) {
      this.state.setZoom = this.hasResized();
    }

    if (this.state.setZoom && this.pluckedOverlays.length) {
      if (this.state.options.zoom) {
        this.state = zoomToContent(this.state, this.pluckedOverlays);
      } else {
        this.state.pan = [0, 0];
        this.state.scale = 1;
      }

      this.state.setZoom = false;
    }

    if (this.state.zoomToContent) {
      this.state = zoomToContent(this.state, this.currentOverlays);
      this.state.zoomToContent = false;
    }

    return super.postProcess();
  }

  updateOptions(options: Optional<FrameState["options"]>) {
    const state: Optional<FrameState> = { options };
    if (options.zoom !== undefined) {
      state.setZoom = this.state.options.zoom !== options.zoom;
    }
    this.updater(state);
  }
}

export class ImageLooker extends Looker<ImageState> {
  private overlays: Overlay<ImageState>[];

  constructor(
    sample: BaseSample,
    config: ImageState["config"],
    options: ImageState["options"]
  ) {
    super(sample, config, options);
    this.overlays = [];
  }

  getElements() {
    return getImageElements(this.updater, this.getDispatchEvent());
  }

  getInitialState(
    config: ImageState["config"],
    options: ImageState["options"]
  ) {
    options = {
      ...this.getDefaultOptions(),
      ...options,
    };

    return {
      ...this.getInitialBaseState(),
      config: { ...config },
      options,
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

  loadOverlays(sample: BaseSample) {
    this.overlays = loadOverlays(sample);
  }

  pluckOverlays() {
    return this.overlays;
  }

  postProcess(): ImageState {
    if (!this.state.setZoom) {
      this.state.setZoom = this.hasResized();
    }

    if (this.state.setZoom && this.pluckedOverlays.length) {
      if (this.state.options.zoom) {
        this.state = zoomToContent(this.state, this.pluckedOverlays);
      } else {
        this.state.pan = [0, 0];
        this.state.scale = 1;
      }

      this.state.setZoom = false;
    }

    if (this.state.zoomToContent) {
      this.state = zoomToContent(this.state, this.currentOverlays);
      this.state.zoomToContent = false;
    }

    return super.postProcess();
  }

  updateOptions(options: Optional<ImageState["options"]>) {
    const state: Optional<ImageState> = { options };
    if (options.zoom !== undefined) {
      state.setZoom = this.state.options.zoom !== options.zoom;
    }
    this.updater(state);
  }
}

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
  sampleId: string;
  frameNumber: number;
  frameCount: number;
  update: StateUpdate<VideoState>;
  dispatchEvent: (eventType: string, detail: any) => void;
}

const { aquireReader, addFrame } = (() => {
  const createCache = () =>
    new LRU<WeakRef<RemoveFrame>, Frame>({
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

  let frameCache = createCache();

  let streamSize = 0;
  let nextRange: BufferRange = null;

  const frameReader = createWorker();
  let requestingFrames: boolean = false;
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
  }: AcquireReaderOptions): string => {
    streamSize = 0;
    nextRange = [frameNumber, Math.min(frameCount, CHUNK_SIZE + frameNumber)];
    const subscription = uuid();
    frameReader.onmessage = (message: MessageEvent<FrameChunkResponse>) => {
      const {
        data: {
          uuid,
          method,
          frames,
          range: [start, end],
        },
      } = message;
      if (uuid === subscription && method === "frameChunk") {
        addFrameBuffers([start, end]);
        Array(end - start + 1)
          .fill(0)
          .forEach((_, i) => {
            const frameNumber = start + i;
            const frameSample = frames[i] || { frame_number: frameNumber };
            const prefixedFrameSample = Object.fromEntries(
              Object.entries(frameSample).map(([k, v]) => ["frames." + k, v])
            ) as FrameSample;

            const overlays = loadOverlays(prefixedFrameSample);
            overlays.forEach((overlay) => {
              streamSize += overlay.getSizeBytes();
            });
            const frame = { sample: frameSample, overlays };
            frameCache.set(new WeakRef(removeFrame), frame);
            addFrame(frameNumber, frame);
          });

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
      }
    };
    requestingFrames = true;
    frameReader.postMessage({
      method: "setStream",
      sampleId,
      frameCount,
      frameNumber,
      uuid: subscription,
      origin: window.location.origin,
    });
    return subscription;
  };

  return {
    aquireReader: (
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

export class VideoLooker extends Looker<VideoState, VideoSample> {
  private sampleOverlays: Overlay<VideoState>[] = [];
  private frames: Map<number, WeakRef<Frame>> = new Map();
  protected imageSource: HTMLVideoElement;
  private requestFrames: (frameNumber: number, force?: boolean) => void;

  constructor(
    sample: VideoSample,
    config: VideoState["config"],
    options: VideoState["options"]
  ) {
    super(sample, config, options);
  }

  get frameNumber() {
    return this.state.frameNumber;
  }

  get playing() {
    return this.state.playing;
  }

  get waiting() {
    return this.imageSource.seeking;
  }

  dispatchImpliedEvents(
    previousState: Readonly<VideoState>,
    state: Readonly<VideoState>
  ): void {
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
            label_id: label._id,
            sample_id: this.sample._id,
          });
        });
      } else {
        const { id: label_id, field } = overlay.getSelectData(this.state);
        labels.push({ label_id, field, sample_id: this.sample._id });
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
              label_id: label._id,
              frame_number: this.frameNumber,
              sample_id: this.sample._id,
            });
          });
        } else {
          const { id: label_id, field } = overlay.getSelectData(this.state);
          labels.push({
            label_id,
            field,
            sample_id: this.sample._id,
            frame_number: this.frameNumber,
          });
        }
      });
    }

    return labels;
  }

  getElements() {
    return getVideoElements(this.updater, this.getDispatchEvent());
  }

  getInitialState(
    config: VideoState["config"],
    options: VideoState["options"]
  ): VideoState {
    return {
      duration: null,
      seeking: false,
      locked: false,
      fragment: null,
      playing: false,
      frameNumber: 1,
      buffering: false,
      ...this.getInitialBaseState(),
      config: { ...config },
      options: {
        ...this.getDefaultOptions(),
        ...options,
      },
      buffers: [[1, 1]] as Buffers,
      seekBarHovering: false,
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
      )
    );

    const providedFrames = sample.frames || [{ frame_number: 1 }];
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
    const overlays = this.sampleOverlays;
    let pluckedOverlays = this.pluckedOverlays;
    if (this.hasFrame(state.frameNumber)) {
      const frame = this.frames.get(state.frameNumber)?.deref();
      if (frame !== undefined) {
        pluckedOverlays = [...overlays, ...frame.overlays];
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
      this.requestFrames = aquireReader({
        addFrame: (frameNumber, frame) =>
          this.frames.set(frameNumber, new WeakRef(frame)),
        addFrameBuffers: (range) =>
          (this.state.buffers = addToBuffers(range, this.state.buffers)),
        removeFrame: (frameNumber) =>
          removeFromBuffers(frameNumber, this.state.buffers),
        getCurrentFrame: () => this.frameNumber,
        sampleId: this.state.config.sampleId,
        frameCount,
        frameNumber: Math.max(state.frameNumber, 2),
        update: this.updater,
        dispatchEvent: (event, detail) => this.dispatchEvent(event, detail),
      });
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

  getSample(): Promise<VideoSample> {
    return new Promise((resolve) => {
      const resolver = () => {
        if (this.hasFrame(this.frameNumber)) {
          resolve({
            ...this.sample,
            frames: [this.frames.get(this.frameNumber).deref().sample],
          });
          return;
        }
        setTimeout(resolver, 200);
      };

      resolver();
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

  resetToFragment(): void {
    this.updater(({ fragment }) => {
      if (!fragment) {
        this.dispatchEvent("error", new Error("No fragment set"));
        return {};
      } else {
        return { locked: true, frameNumber: fragment[0] };
      }
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

    if (this.state.setZoom) {
      this.state.pan = [0, 0];
      this.state.scale = 1;

      this.state.setZoom = false;
    }

    if (this.state.zoomToContent) {
      this.state = zoomToContent(this.state, this.currentOverlays);
      this.state.zoomToContent = false;
    }
    return super.postProcess();
  }

  updateOptions(options: Optional<VideoState["options"]>) {
    this.updater({ options });
  }

  updateSample(sample: VideoSample) {
    this.state.buffers = [[1, 1]];
    this.frames.clear();
    super.updateSample(sample);
    this.requestFrames(this.frameNumber, true);
  }

  private hasFrame(frameNumber: number) {
    return (
      this.frames.has(frameNumber) &&
      this.frames.get(frameNumber)?.deref() !== undefined
    );
  }
}
