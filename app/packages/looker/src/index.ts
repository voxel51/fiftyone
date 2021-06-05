/**
 * Copyright 2017-2021, Voxel51, Inc.
 */
import { mergeWith } from "immutable";

import { FONT_SIZE, MIN_PIXELS, STROKE_WIDTH } from "./constants";
import {
  getFrameElements,
  getImageElements,
  getVideoElements,
} from "./elements";
import { LookerElement } from "./elements/common";
import processOverlays from "./processOverlays";
import { ClassificationsOverlay, FROM_FO, POINTS_FROM_FO } from "./overlays";
import { Overlay } from "./overlays/base";
import { ClassificationLabels } from "./overlays/classifications";
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
  Dimensions,
  BoundingBox,
} from "./state";
import {
  getContainingBox,
  getElementBBox,
  getFitRect,
  getFontSize,
  getPixelCoordinates,
  getStrokeWidth,
  snapBox,
} from "./util";

import "./style.css";

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
    this.sample = sample;
    this.eventTarget = new EventTarget();
    this.updater = this.makeUpdate();
    this.state = this.getInitialState(config, options);
    this.loadOverlays();
    this.pluckedOverlays = this.pluckOverlays(this.state);
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
      if (Object.keys(updates).length === 0) {
        return;
      }
      this.state = mergeUpdates(this.state, updates);
      this.state = this.postProcess(this.lookerElement.element.parentElement);
      this.pluckedOverlays = this.pluckOverlays(this.state);
      const context = this.canvas.getContext("2d");
      [this.currentOverlays, this.state.rotate] = processOverlays(
        this.state,
        this.pluckedOverlays
      );
      postUpdate && postUpdate(this.state, this.currentOverlays);
      this.lookerElement.render(this.state as Readonly<State>);

      const numOverlays = this.currentOverlays.length;
      clearContext(context);
      for (let index = numOverlays - 1; index >= 0; index--) {
        this.currentOverlays[index].draw(context, this.state);
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
    element.appendChild(this.lookerElement.render(this.state));
    this.resizeObserver.observe(element);
  }

  detach(): void {
    this.resizeObserver.unobserve(this.lookerElement.element.parentElement);
    this.lookerElement.element.parentNode.removeChild(
      this.lookerElement.element
    );
  }

  destroy(): void {
    this.detach();
    delete this.lookerElement;
  }

  update(options: Optional<State["options"]>) {
    this.updater({ options });
  }

  protected abstract getElements(): LookerElement<State>;

  protected abstract loadOverlays();

  protected abstract pluckOverlays(state: Readonly<State>): Overlay<State>[];

  protected abstract getDefaultOptions(): State["options"];

  protected abstract getInitialState(
    config: State["config"],
    options: Optional<State["options"]>
  ): State;

  protected getInitialBaseState(): Omit<BaseState, "config" | "options"> {
    return {
      cursorCoordinates: [0, 0],
      pixelCoordinates: null,
      disableControls: false,
      hovering: false,
      hoveringControls: false,
      showControls: false,
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
    };
  }

  protected postProcess(element: HTMLElement): State {
    let [tlx, tly, w, h] = this.state.windowBBox;
    this.state.transformedWindowBBox = [
      tlx + this.state.pan[0],
      tly + this.state.pan[1],
      this.state.scale * w,
      this.state.scale * h,
    ];
    this.state.mediaBBox = getFitRect(
      this.state.config.dimensions,
      this.state.windowBBox
    );
    this.state.transformedMediaBBox = getFitRect(
      this.state.config.dimensions,
      this.state.transformedWindowBBox
    );
    this.state.pixelCoordinates = getPixelCoordinates(
      this.state.cursorCoordinates,
      this.state.transformedMediaBBox
    );
    const [from, to] = [
      this.state.config.dimensions[0],
      this.state.mediaBBox[2],
    ];
    this.state.strokeWidth = getStrokeWidth(from, to, this.state.scale);
    this.state.fontSize = getFontSize(from, to, this.state.scale);
    return this.state;
  }
}

export class FrameLooker extends Looker<FrameState> {
  private overlays: Overlay<FrameState>[];

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

  loadOverlays() {
    this.overlays = loadOverlays(this.state, this.sample);
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

  loadOverlays() {
    this.overlays = loadOverlays(this.state, this.sample);
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

interface VideoSample extends BaseSample {
  frames: { [frameNumber: number]: BaseSample };
}

export class VideoLooker extends Looker<VideoState, VideoSample> {
  private sampleOverlays: Overlay<VideoState>[];
  private frameOverlays: { [frameNumber: number]: Overlay<VideoState>[] };

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
      ...this.getInitialBaseState(),
      config: { ...config },
      options: {
        ...this.getDefaultOptions(),
        ...options,
      },
    };
  }

  loadOverlays() {
    this.sampleOverlays = loadOverlays(
      this.state,
      Object.fromEntries(
        Object.entries(this.sample).filter(
          ([fieldName]) => fieldName !== "frames."
        )
      )
    );
    this.frameOverlays = Object.fromEntries(
      Object.entries(this.sample.frames || []).map(
        ([frameNumber, frameSample]) => {
          return [
            Number(frameNumber),
            loadOverlays(
              this.state,
              Object.fromEntries(
                Object.entries(frameSample).map(([fieldName, field]) => {
                  return [`frames.${fieldName}`, field];
                })
              )
            ),
          ];
        }
      )
    );
  }

  pluckOverlays({ frameNumber }) {
    const overlays = this.sampleOverlays;
    if (frameNumber in this.frameOverlays) {
      return [...overlays, ...this.frameOverlays[frameNumber]];
    }
    return overlays;
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
}

function loadOverlays<State extends BaseState>(
  config: Readonly<State>,
  sample: {
    [key: string]: any;
  }
): Overlay<State>[] {
  const classifications = <ClassificationLabels>[];
  let overlays = [];
  for (const field in sample) {
    const label = sample[field];
    if (!label) {
      continue;
    }
    if (label._cls in FROM_FO) {
      const labelOverlays = FROM_FO[label._cls](config, field, label, this);
      overlays = [...overlays, ...labelOverlays];
    } else if (label._cls === "Classification") {
      classifications.push([field, label]);
    } else if (label._cls === "Classifications") {
      classifications.push([field, label.classifications]);
    }
  }

  if (classifications.length > 0) {
    const overlay = new ClassificationsOverlay(classifications);
    overlays.push(overlay);
  }

  return overlays;
}

function clearContext(context: CanvasRenderingContext2D): void {
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.strokeStyle = "#fff";
  context.fillStyle = "#fff";
  context.lineWidth = 3;
  context.font = "14px sans-serif";
  // easier for setting offsets
  context.textBaseline = "bottom";
}

const adjustBox = (
  [w, h]: Dimensions,
  [obtlx, obtly, obw, obh]: BoundingBox
): {
  center: Coordinates;
  box: BoundingBox;
} => {
  const ar = obw / obh;
  let [btlx, btly, bw, bh] = [obtlx, obtly, obw, obh];

  while (bw * w < MIN_PIXELS || bh * h < MIN_PIXELS) {
    bw = bw * 1.5;
    bh = bw / ar;
    btlx = obtlx + obw / 2 - bw / 2;
    btly = obtly + obh / 2 - bh / 2;
  }

  return {
    center: [obtlx + obw / 2, obtly + obh / 2],
    box: [btlx, btly, bw, bh],
  };
};

function zoomToContent<State extends FrameState | ImageState>(
  state: Readonly<State>,
  currentOverlays: Overlay<State>[]
): State {
  if (state.options.zoom && state.canZoom) {
    const points = currentOverlays.map((o) => o.getPoints()).flat();
    let [iw, ih] = state.config.dimensions;
    let [w, h] = [iw, ih];
    const iAR = w / h;
    const {
      center: [cw, ch],
      box: [_, __, bw, bh],
    } = adjustBox([w, h], getContainingBox(points));

    const [___, ____, ww, wh] = state.windowBBox;
    let wAR = ww / wh;

    let scale = 1;
    let pan: Coordinates = [0, 0];
    const squeeze = 1 - state.options.zoomPad;

    if (wAR < iAR) {
      scale = Math.max(1, 1 / bw);
      w = ww * scale;
      h = w / iAR;
      if (!state.config.thumbnail && bh * h > wh) {
        scale = Math.max(1, (wh * scale) / (bh * h));
        w = ww * scale;
        h = w / iAR;
      }
    } else {
      scale = Math.max(1, 1 / bh);
      h = wh * scale;
      w = h * iAR;
      if (!state.config.thumbnail && bw * w > ww) {
        scale = Math.max(1, (ww * scale) / (bw * w));
        h = wh * scale;
        w = h * iAR;
      }
    }

    const marginX = (scale * ww - w) / 2;
    const marginY = (scale * wh - h) / 2;
    pan = [-w * cw - marginX + ww / 2, -h * ch - marginY + wh / 2];

    // Scale down and reposition for a centered patch with padding
    if (w * squeeze > ww && h * squeeze > wh) {
      scale = squeeze * scale;
      pan[0] = pan[0] * squeeze + (bw * w * (1 - squeeze)) / 2;
      pan[1] = pan[1] * squeeze + (bh * h * (1 - squeeze)) / 2;
    }

    pan = snapBox(scale, pan, [ww, wh], [iw, ih]);

    return mergeUpdates(state, { scale: scale, pan });
  }
  return state;
}

function mergeUpdates<State extends BaseState>(
  state: State,
  updates: Optional<State>
): State {
  const merger = (o, n) => {
    if (Array.isArray(n)) {
      return n;
    }
    if (n instanceof Function) {
      return n;
    }
    if (typeof n !== "object") {
      return n === undefined ? o : n;
    }
    if (n === null) {
      return n;
    }
    return mergeWith(merger, o, n);
  };
  return mergeWith(merger, state, updates);
}

export const zoomAspectRatio = (
  sample: {
    [key: string]: { _cls?: string };
  },
  mediaAspectRatio: number
): number => {
  let points = [];
  Object.entries(sample).forEach(([_, label]) => {
    if (label && label._cls in POINTS_FROM_FO) {
      points = [...points, ...POINTS_FROM_FO[label._cls](label)];
    }
  });
  let [_, __, width, height] = getContainingBox(points);

  if (width === 0 || height === 0) {
    if (width === height) {
      width = 1;
      height = 1;
    } else if (height === 0) {
      height = width;
    } else {
      width = height;
    }
  }
  return (width / height) * mediaAspectRatio;
};
