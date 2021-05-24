/**
 * Copyright 2017-2021, Voxel51, Inc.
 */
import { mergeWith } from "immutable";

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
} from "./state";
import {
  getFrameElements,
  getImageElements,
  getVideoElements,
} from "./elements";
import { LookerElement } from "./elements/common";
import { ClassificationsOverlay, FROM_FO } from "./overlays";
import { ClassificationLabels } from "./overlays/classifications";
import { Overlay } from "./overlays/base";
import processOverlays from "./processOverlays";
import { ColorGenerator } from "./color";

interface BaseSample {
  metadata: {
    width: number;
    height: number;
  };
}

abstract class Looker<
  State extends BaseState,
  Sample extends BaseSample = BaseSample
> {
  private eventTarget: EventTarget;
  private state: State;
  private lookerElement: LookerElement<State>;
  private canvas: HTMLCanvasElement;
  private currentOverlays: Overlay<State>[];

  protected readonly updater: StateUpdate<State>;
  protected sample: Sample;

  constructor(
    sample: Sample,
    config: State["config"],
    options: State["options"]
  ) {
    this.sample = sample;
    this.loadOverlays();
    this.eventTarget = new EventTarget();
    this.updater = this.makeUpdate();
    this.state = this.getInitialState(config, options);
    this.lookerElement = this.getElements();
    this.canvas = this.lookerElement.render(this.state).querySelector("canvas");
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

      const merger = (o, n, k) => {
        if (Array.isArray(n)) {
          return n;
        }
        if (n instanceof Function || n instanceof ColorGenerator) {
          return n;
        }
        if (typeof n !== "object") {
          return n || o;
        }
        if (n === null) {
          return n;
        }
        return mergeWith(merger, o, n);
      };
      this.state = mergeWith<State>(merger, this.state, updates);
      this.lookerElement.render(this.state as Readonly<State>);
      const context = this.canvas.getContext("2d");
      this.currentOverlays = processOverlays(
        context,
        this.state,
        this.pluckOverlays(this.state)
      );
      if (postUpdate) {
        postUpdate(context, this.state, this.currentOverlays);
      }
      clearCanvas(context);
      const numOverlays = this.currentOverlays.length;
      for (let index = numOverlays - 1; index > 0; index--) {
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
    element.appendChild(this.lookerElement.render(this.state));
  }

  detach(): void {
    this.lookerElement.element.parentNode.removeChild(
      this.lookerElement.element
    );
  }

  destroy(): void {
    this.detach();
    delete this.lookerElement;
  }

  update(sample: Sample, options: State["options"]) {
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
    options: State["options"]
  ): State;

  protected getInitialBaseState(): Omit<BaseState, "config" | "options"> {
    return {
      cursorCoordinates: null,
      disableControls: false,
      focused: false,
      hovering: false,
      hoveringControls: false,
      showControls: false,
      showOptions: false,
      loaded: false,
      scale: 1,
      pan: <Coordinates>[0, 0],
      rotate: 0,
    };
  }
}

export class FrameLooker extends Looker<FrameState> {
  private overlays: Overlay<FrameState>[];

  getElements() {
    return getFrameElements(this.updater, this.getDispatchEvent());
  }

  getInitialState(config, options) {
    return {
      duration: null,
      ...this.getInitialBaseState(),
      config: { ...config },
      options: {
        ...this.getDefaultOptions(),
        ...options,
      },
    };
  }

  getDefaultOptions() {
    return DEFAULT_FRAME_OPTIONS;
  }

  loadOverlays() {
    this.overlays = loadOverlays(this.sample);
  }

  pluckOverlays() {
    return this.overlays;
  }
}

export class ImageLooker extends Looker<ImageState> {
  private overlays: Overlay<ImageState>[];

  getElements() {
    return getImageElements(this.updater, this.getDispatchEvent());
  }

  getInitialState(config, options) {
    return {
      ...this.getInitialBaseState(),
      config: { ...config },
      options: {
        ...this.getDefaultOptions(),
        ...options,
      },
    };
  }

  getDefaultOptions() {
    return DEFAULT_IMAGE_OPTIONS;
  }

  loadOverlays() {
    this.overlays = loadOverlays(this.sample);
  }

  pluckOverlays() {
    return this.overlays;
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
      Object.fromEntries(
        Object.entries(this.sample).filter(
          ([fieldName]) => fieldName !== "frames."
        )
      )
    );
    this.frameOverlays = Object.fromEntries(
      Object.entries(this.sample.frames).map(([frameNumber, frameSample]) => {
        return [
          Number(frameNumber),
          loadOverlays(
            Object.fromEntries(
              Object.entries(frameSample).map(([fieldName, field]) => {
                return [`frames.${fieldName}`, field];
              })
            )
          ),
        ];
      })
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

function loadOverlays<State extends BaseState>(sample: {
  [key: string]: any;
}): Overlay<State>[] {
  const classifications = <ClassificationLabels>[];
  let overlays = [];
  for (const field in sample) {
    const label = sample[field];
    if (!label) {
      continue;
    }
    if (label._cls in FROM_FO) {
      const labelOverlays = FROM_FO[label._cls](field, label, this);
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

function clearCanvas(context: CanvasRenderingContext2D): void {
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.strokeStyle = "#fff";
  context.fillStyle = "#fff";
  context.lineWidth = 3;
  context.font = "14px sans-serif";
  // easier for setting offsets
  context.textBaseline = "bottom";
}
