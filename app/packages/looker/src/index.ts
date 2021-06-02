/**
 * Copyright 2017-2021, Voxel51, Inc.
 */
import { mergeWith } from "immutable";
import { G, Svg, SVG } from "@svgdotjs/svg.js";

import "./style.css";
export { ColorGenerator } from "./color";
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
  getFrameElements,
  getImageElements,
  getVideoElements,
} from "./elements";
import { LookerElement } from "./elements/common";
import { ClassificationsOverlay, FROM_FO, POINTS_FROM_FO } from "./overlays";
import { ClassificationLabels } from "./overlays/classifications";
import { Overlay } from "./overlays/base";
import processOverlays from "./processOverlays";
import { ColorGenerator } from "./color";
import { elementBBox, getContainingBox, snapBox } from "./util";
import { MIN_PIXELS, STROKE_WIDTH } from "./constants";

export abstract class Looker<
  State extends BaseState = BaseState,
  Sample extends BaseSample = BaseSample
> {
  private eventTarget: EventTarget;
  protected lookerElement: LookerElement<State>;
  private canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver;

  protected currentOverlays: Overlay<State>[];
  protected pluckedOverlays: Overlay<State>[];
  protected sample: Sample;
  protected state: State;
  protected readonly svg: Svg;
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
    this.resizeObserver = new ResizeObserver(() =>
      requestAnimationFrame(() => this.updater(({ loaded }) => ({ loaded })))
    );
    this.svg = SVG()
      .viewbox(`0 0 ${config.dimensions[0]} ${config.dimensions[1]}`)
      .addTo(<HTMLElement>this.lookerElement.element.firstChild);
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
      this.pluckedOverlays = this.pluckOverlays(this.state);
      const [_, __, w, h] = elementBBox(this.lookerElement.element);
      [this.currentOverlays, this.state.rotate] = processOverlays(
        this.svg,
        this.state,
        this.pluckedOverlays
      );
      this.state = this.postProcess(this.lookerElement.element);
      postUpdate && postUpdate(this.svg, this.state, this.currentOverlays);
      this.lookerElement.render(this.state as Readonly<State>);
      this.svg.clear();
      const fragment = new G();

      const numOverlays = this.currentOverlays.length;
      const strokeWidth =
        (STROKE_WIDTH / this.state.config.dimensions[0]) * w * this.state.scale;
      for (let index = numOverlays - 1; index >= 0; index--) {
        this.currentOverlays[index].draw(fragment, this.state, strokeWidth);
      }
      this.svg.add(fragment);
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

  update(sample: Sample, options: Optional<State["options"]>) {
    this.sample = sample;
    this.loadOverlays();
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
      cursorCoordinates: null,
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
      strokeWidth: 2,
    };
  }

  protected postProcess(element: HTMLElement): State {
    return this.state;
  }
}

export class FrameLooker extends Looker<FrameState> {
  private overlays: Overlay<FrameState>[];

  getElements() {
    return getFrameElements(this.state, this.updater, this.getDispatchEvent());
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
    this.overlays = loadOverlays(this.state.config, this.sample);
  }

  pluckOverlays() {
    return this.overlays;
  }

  postProcess(element): FrameState {
    return zoomToContent(this.state, this.pluckedOverlays, element);
  }
}

export class ImageLooker extends Looker<ImageState> {
  private overlays: Overlay<ImageState>[];

  getElements() {
    return getImageElements(this.state, this.updater, this.getDispatchEvent());
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
    this.overlays = loadOverlays(this.state.config, this.sample);
  }

  pluckOverlays() {
    return this.overlays;
  }

  postProcess(element): ImageState {
    return zoomToContent(this.state, this.pluckedOverlays, element);
  }
}

interface VideoSample extends BaseSample {
  frames: { [frameNumber: number]: BaseSample };
}

export class VideoLooker extends Looker<VideoState, VideoSample> {
  private sampleOverlays: Overlay<VideoState>[];
  private frameOverlays: { [frameNumber: number]: Overlay<VideoState>[] };

  getElements() {
    return getVideoElements(this.state, this.updater, this.getDispatchEvent());
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
      this.state.config,
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
              this.state.config,
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
}

function loadOverlays<State extends BaseState>(
  config: Readonly<State["config"]>,
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
  currentOverlays: Overlay<State>[],
  looker: HTMLDivElement
): State {
  if (state.options.zoom && state.canZoom) {
    const points = currentOverlays.map((o) => o.getPoints()).flat();
    let [iw, ih] = state.config.dimensions;
    let [w, h] = [iw, ih];
    const iAR = w / h;
    const {
      center: [cw, ch],
      box: [btlx, btly, bw, bh],
    } = adjustBox([w, h], getContainingBox(points));

    const [_, __, ww, wh] = elementBBox(looker);
    let wAR = ww / wh;

    let scale = 1;
    let pan: Coordinates = [0, 0];
    const squeeze = 0.9;

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
    if (n instanceof Function || n instanceof ColorGenerator) {
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
  const [_, __, width, height] = getContainingBox(points);
  return (width / height) * mediaAspectRatio;
};
