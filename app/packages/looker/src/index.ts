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
} from "./constants";
import {
  getFrameElements,
  getImageElements,
  getVideoElements,
} from "./elements";
import { LookerElement } from "./elements/common";
import processOverlays from "./processOverlays";
import { loadOverlays } from "./overlays";
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
} from "./state";
import {
  createWorker,
  getElementBBox,
  getFitRect,
  mergeUpdates,
  snapBox,
} from "./util";
import { zoomToContent } from "./zoom";

import "./style.css";
import { getFrameNumber } from "./elements/util";

export { zoomAspectRatio } from "./zoom";

const labelsWorker = createWorker();

export abstract class Looker<
  State extends BaseState = BaseState,
  Sample extends BaseSample = BaseSample
> {
  private eventTarget: EventTarget;
  protected lookerElement: LookerElement<State>;
  private resizeObserver: ResizeObserver;

  protected currentOverlays: Overlay<State>[];
  protected pluckedOverlays: Overlay<State>[];
  protected sample: Sample;
  protected state: State;
  protected readonly canvas: HTMLCanvasElement;
  protected readonly updater: StateUpdate<State>;

  constructor(
    sample: Sample,
    config: State["config"],
    options: Optional<State["options"]>
  ) {
    this.updateSample(sample);
    this.eventTarget = new EventTarget();
    this.updater = this.makeUpdate();
    this.state = this.getInitialState(config, options);
    this.pluckedOverlays = [];
    this.currentOverlays = [];
    this.lookerElement = this.getElements();
    this.canvas = this.lookerElement.children[1].element as HTMLCanvasElement;
    this.resizeObserver = new ResizeObserver(() =>
      requestAnimationFrame(() => this.updater(({ loaded }) => ({ loaded })))
    );
  }

  protected dispatchEvent(eventType: string, detail: any): void {
    this.eventTarget.dispatchEvent(new CustomEvent(eventType, { detail }));
  }

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
      if (Object.keys(updates).length === 0 && !postUpdate) {
        return;
      }
      this.state = mergeUpdates(this.state, updates);
      this.pluckedOverlays = this.pluckOverlays(this.state);
      [this.currentOverlays, this.state.rotate] = processOverlays(
        this.state,
        this.pluckedOverlays
      );
      this.state = this.postProcess(this.lookerElement.element);
      this.state.mouseIsOnOverlay =
        this.currentOverlays.length &&
        this.currentOverlays[0].containsPoint(this.state) > CONTAINS.NONE;
      postUpdate && postUpdate(this.state, this.currentOverlays);
      this.lookerElement.render(this.state as Readonly<State>);

      const ctx = this.canvas.getContext("2d");
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.lineWidth = this.state.strokeWidth;
      ctx.font = `bold ${this.state.fontSize.toFixed(2)}px Palanquin`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(...this.state.pan);
      ctx.scale(this.state.scale, this.state.scale);
      const numOverlays = this.currentOverlays.length;
      for (let index = numOverlays - 1; index >= 0; index--) {
        this.currentOverlays[index].draw(ctx, this.state);
      }
    };
  }

  addEventListener(eventType, handler, ...args) {
    this.eventTarget.addEventListener(eventType, handler, ...args);
  }

  removeEventListener(eventType, handler, ...args) {
    this.eventTarget.removeEventListener(eventType, handler, ...args);
  }

  attach(element: HTMLElement): void {
    this.state = this.postProcess(element);
    this.resizeObserver.observe(this.lookerElement.element);
    element.appendChild(this.lookerElement.element);
  }

  detach(): void {
    this.resizeObserver.unobserve(this.lookerElement.element);
    this.lookerElement.element.parentNode.removeChild(
      this.lookerElement.element
    );
  }

  destroy(): void {
    this.detach();
    delete this.lookerElement;
  }

  updateOptions(options: Optional<State["options"]>) {
    this.updater({ options });
  }

  updateSample(sample: Sample) {
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

  getSample(): Promise<Sample> {
    return Promise.resolve(this.sample);
  }

  protected abstract getElements(): LookerElement<State>;

  protected abstract loadOverlays(sample: BaseSample);

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
      canZoom: false,
      strokeWidth: STROKE_WIDTH,
      fontSize: FONT_SIZE,
      wheeling: false,
      transformedWindowBBox: null,
      windowBBox: null,
      transformedMediaBBox: null,
      mediaBBox: null,
      canvasBBox: null,
      textPad: PAD,
      fullscreen: false,
      pointRadius: POINT_RADIUS,
      mouseIsOnOverlay: false,
      overlaysPrepared: false,
      tooltipDisabled: false,
    };
  }

  protected postProcess(element: HTMLElement): State {
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
    this.state.config.thumbnail && (this.state.strokeWidth /= 2);
    this.state.textPad = PAD / this.state.scale;

    return this.state;
  }
}

export class FrameLooker extends Looker<FrameState> {
  private overlays: Overlay<FrameState>[];

  constructor(sample, config, options) {
    super(sample, config, options);
    this.overlays = [];
  }

  getElements() {
    return getFrameElements(this.updater, this.getDispatchEvent());
  }

  getInitialState(config, options) {
    options = {
      ...this.getDefaultOptions(),
      ...options,
    };
    return {
      duration: null,
      ...this.getInitialBaseState(),
      canZoom: options.zoom,
      config: { ...config },
      options,
    };
  }

  getDefaultOptions() {
    return DEFAULT_FRAME_OPTIONS;
  }

  loadOverlays(sample) {
    this.overlays = loadOverlays(sample);
  }

  pluckOverlays() {
    return this.overlays;
  }

  postProcess(element): FrameState {
    this.state.windowBBox = getElementBBox(element);
    this.state = zoomToContent(this.state, this.pluckedOverlays);
    return super.postProcess(element);
  }
}

export class ImageLooker extends Looker<ImageState> {
  private overlays: Overlay<ImageState>[];

  constructor(sample, config, options) {
    super(sample, config, options);
    this.overlays = [];
  }

  getElements() {
    return getImageElements(this.updater, this.getDispatchEvent());
  }

  getInitialState(config, options) {
    options = {
      ...this.getDefaultOptions(),
      ...options,
    };

    return {
      ...this.getInitialBaseState(),
      canZoom: options.zoom,
      config: { ...config },
      options,
    };
  }

  getDefaultOptions() {
    return DEFAULT_IMAGE_OPTIONS;
  }

  loadOverlays(sample) {
    this.overlays = loadOverlays(sample);
  }

  pluckOverlays() {
    return this.overlays;
  }

  postProcess(element): ImageState {
    this.state.windowBBox = getElementBBox(element);
    this.state = zoomToContent(this.state, this.pluckedOverlays);
    return super.postProcess(element);
  }
}

interface Frame {
  sample: FrameSample;
  overlays: Overlay<VideoState>[];
}

interface AcquireReaderOptions {
  addFrame: (frameNumber: number, frame: Frame) => void;
  getCurrentFrame: () => number;
  sampleId: string;
  frameNumber: number;
  frameCount: number;
  update: StateUpdate<VideoState>;
}

const aquireReader = (() => {
  const frameCache = new LRU<
    { sampleId: string; frameNumber: number; uuid: string },
    Frame
  >({
    max: MAX_FRAME_CACHE_SIZE_BYTES,
    length: (frame) => {
      let size = 1;
      frame.overlays.forEach((overlay) => {
        size += overlay.getSizeBytes();
      });
      return size;
    },
  });
  let streamSize = 0;
  let streamCount = 0;

  const frameReader = createWorker();
  let requestingFrames: boolean = false;

  return ({
    addFrame,
    frameNumber,
    frameCount,
    getCurrentFrame,
    sampleId,
    update,
  }: AcquireReaderOptions): (() => void) => {
    const subscription = uuid();
    streamSize = 0;
    streamCount = 0;
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
            streamCount += 1;
            const frame = { sample: frameSample, overlays };
            frameCache.set(
              { sampleId, frameNumber, uuid: subscription },
              frame
            );
            addFrame(frameNumber, frame);
          });

        const requestMore =
          streamCount < end - getCurrentFrame() &&
          streamSize < MAX_FRAME_CACHE_SIZE_BYTES;

        if (requestMore && end < frameCount) {
          requestingFrames = true;
          frameReader.postMessage({
            method: "requestFrameChunk",
            uuid: subscription,
          });
        } else {
          requestingFrames = false;
        }

        update({ buffering: false });
      }
    };
    requestingFrames = true;
    frameReader.postMessage({
      method: "setStream",
      sampleId,
      frameCount,
      frameNumber,
      uuid: subscription,
    });

    return () => {
      if (!requestingFrames) {
        frameReader.postMessage({
          method: "requestFrameChunk",
          uuid: subscription,
        });
      }
      requestingFrames = true;
    };
  };
})();

let lookerWithReader: VideoLooker = null;

export class VideoLooker extends Looker<VideoState, VideoSample> {
  private sampleOverlays: Overlay<VideoState>[];
  private frames: Map<number, WeakRef<Frame>>;
  private firstFrame: Frame;
  private requestFrames: () => void;

  constructor(sample, config, options) {
    super(sample, config, options);
    this.sampleOverlays = [];
    this.frames = new Map();
  }

  get frameNumber() {
    return this.state.frameNumber;
  }

  getElements() {
    return getVideoElements(this.updater, this.getDispatchEvent());
  }

  getInitialState(config, options) {
    return {
      duration: null,
      seeking: false,
      locked: false,
      fragment: null,
      playing: false,
      frameNumber: 1,
      buffering: false,
      hasReader: false,
      ...this.getInitialBaseState(),
      config: { ...config },
      options: {
        ...this.getDefaultOptions(),
        ...options,
      },
      buffers: [],
    };
  }

  loadOverlays(sample) {
    this.sampleOverlays = loadOverlays(
      Object.fromEntries(
        Object.entries(sample).filter(([fieldName]) => fieldName !== "frames")
      )
    );

    const firstFrameSample =
      sample.frames && sample.frames[1] ? sample.frames[1] : {};
    const firstFrameOverlays = loadOverlays(
      Object.fromEntries(
        Object.entries(sample?.frames[1] || {}).map(([k, v]) => [
          "frames." + k,
          v,
        ])
      )
    );

    this.firstFrame = {
      sample: firstFrameSample,
      overlays: firstFrameOverlays,
    };
    this.frames.set(1, new WeakRef(this.firstFrame));
  }

  pluckOverlays(state: VideoState) {
    const overlays = this.sampleOverlays;
    let pluckedOverlays = this.pluckedOverlays;
    if (this.hasFrame(state.frameNumber)) {
      const frame = this.frames.get(state.frameNumber).deref();
      if (frame !== undefined) {
        pluckedOverlays = [...overlays, ...frame.overlays];
      }
    }
    const frameCount = getFrameNumber(
      this.state.duration,
      this.state.duration,
      this.state.config.frameRate
    );

    if (
      (!state.config.thumbnail || state.playing) &&
      lookerWithReader !== this &&
      frameCount
    ) {
      this.requestFrames = aquireReader({
        addFrame: (frameNumber, frame) =>
          this.frames.set(frameNumber, new WeakRef(frame)),
        getCurrentFrame: () => this.frameNumber,
        sampleId: this.state.config.sampleId,
        frameCount,
        frameNumber: Math.max(state.frameNumber, 2),
        update: this.updater,
      });
      lookerWithReader = this;
      this.state.buffers = [];
    } else if (lookerWithReader !== this && frameCount) {
      this.state.playing = false;
      this.state.buffering = false;
    }

    if (lookerWithReader === this) {
      const bufferFrame = Math.min(frameCount, state.frameNumber + CHUNK_SIZE);
      if (this.hasFrame(bufferFrame)) {
        this.state.buffering = false;
      } else {
        this.state.buffering = true;
        this.requestFrames();
      }
    }

    return pluckedOverlays;
  }

  getSample(): Promise<VideoSample> {
    this.updater({ playing: false });
    return new Promise((resolve) => {
      const resolver = () => {
        if (this.hasFrame(this.frameNumber)) {
          resolve({
            ...this.sample,
            frames: {
              [this.frameNumber]: this.frames.get(this.frameNumber),
            },
          });
          return;
        }
        setTimeout(resolver, 200);
      };
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

  postProcess(element): VideoState {
    this.state.windowBBox = getElementBBox(element);
    return super.postProcess(element);
  }

  private hasFrame(frameNumber: number) {
    return (
      this.frames.has(frameNumber) &&
      this.frames.get(frameNumber).deref() !== undefined
    );
  }
}
