/**
 * Copyright 2017-2021, Voxel51, Inc.
 */
import { fromJS, mergeDeep } from "immutable";

import {
  FrameLookerProps,
  FrameState,
  ImageLookerProps,
  ImageState,
  VideoLookerProps,
  VideoState,
  StateUpdate,
  BaseState,
  LookerProps,
  Optional,
  DEFAULT_FRAME_OPTIONS,
  DEFAULT_IMAGE_OPTIONS,
  DEFAULT_VIDEO_OPTIONS,
  BoundingBox,
  Coordinates,
} from "./state";
import {
  GetElements,
  getFrameElements,
  getImageElements,
  getVideoElements,
} from "./elements";
import { LookerElement } from "./elements/common";
export { ColorGenerator } from "./overlays";
import { ClassificationsOverlay, FROM_FO } from "./overlays";

type Sample = any;

abstract class Looker<Props extends LookerProps, State extends BaseState> {
  private eventTarget: EventTarget;
  private state: State;
  private lookerElement: LookerElement<State>;
  protected readonly updater: StateUpdate<State>;
  protected readonly getElements: GetElements<State>;
  private readonly canvas: HTMLCanvasElement;
  private sample: Sample;

  constructor({ sample, element, config, options }: Props) {
    this.eventTarget = new EventTarget();
    this.state = fromJS({
      config,
      options,
    });

    this.sample = sample;
    this.update = this.makeUpdate();
    this.lookerElement = this.getElements(this.updater, this.dispatchEvent);
    element.appendChild(this.lookerElement.element);
    this.canvas = this.lookerElement.element.querySelector("canvas");
    const context = this.canvas.getContext("2d");
    resetCanvas(context);
    this.overlays = loadOverlays(sample);
  }

  protected dispatchEvent(eventType: string, detail: any) {
    this.eventTarget.dispatchEvent(new CustomEvent(eventType, { detail }));
  }

  private makeUpdate(): StateUpdate<State> {
    return (stateOrUpdater) => {
      const updates =
        stateOrUpdater instanceof Function
          ? stateOrUpdater(this.state)
          : stateOrUpdater;
      this.state = mergeDeep<State>(this.state, updates);
      this.lookerElement.render(this.state as Readonly<State>);
    };
  }

  addEventListener(eventType, handler, ...args) {
    this.eventTarget.addEventListener(eventType, handler, ...args);
  }

  removeEventListener(eventType, handler, ...args) {
    this.eventTarget.removeEventListener(eventType, handler, ...args);
  }

  destroy(): void {}

  update(sample: Sample, options: Props["options"]) {
    this.sample = sample;
    this.updater({ options });
  }

  protected abstract getDefaultOptions(): State["options"];

  protected abstract getInitialState(
    parentElement: HTMLElement,
    props: Props
  ): State;

  protected getInitialBaseState(
    parentElement: HTMLElement
  ): Omit<BaseState, "config" | "options"> {
    const rect = parentElement.getBoundingClientRect();
    return {
      cursorCoordinates: null,
      playerBox: <BoundingBox>[rect.top, rect.left, rect.width, rect.height],
      disableControls: false,
      focused: false,
      hovering: false,
      hoveringControls: false,
      showControls: false,
      showOptions: false,
      tooltipOverlay: null,
      loaded: false,
      scale: 1,
      pan: <Coordinates>[0, 0],
    };
  }
}

export class FrameLooker extends Looker<FrameLookerProps, FrameState> {
  protected readonly getElements = getFrameElements;

  constructor(props: FrameLookerProps) {
    super(props);
  }

  getInitialState(parentElement, props) {
    return {
      duration: null,
      ...this.getInitialBaseState(parentElement),
      config: { ...props.config },
      options: {
        ...this.getDefaultOptions(),
        ...props.options,
      },
    };
  }

  getDefaultOptions() {
    return DEFAULT_FRAME_OPTIONS;
  }
}

export class ImageLooker extends Looker<ImageLookerProps, ImageState> {
  protected readonly getElements = getImageElements;

  constructor(props: ImageLookerProps) {
    super(props);
  }

  getInitialState(parentElement, props) {
    return {
      ...this.getInitialBaseState(parentElement),
      config: { ...props.config },
      options: {
        ...this.getDefaultOptions(),
        ...props.options,
      },
    };
  }

  getDefaultOptions() {
    return DEFAULT_IMAGE_OPTIONS;
  }
}

export class VideoLooker extends Looker<VideoLookerProps, VideoState> {
  protected readonly getElements = getVideoElements;

  constructor(props: VideoLookerProps) {
    super(props);
  }

  getInitialState(parentElement, props) {
    return {
      duration: null,
      seeking: false,
      locked: false,
      fragment: null,
      playing: false,
      frameNumber: 1,
      ...this.getInitialBaseState(parentElement),
      config: { ...props.config },
      options: {
        ...this.getDefaultOptions(),
        ...props.options,
      },
    };
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

function loadOverlays(
  sample,
  context: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  const classifications = [];
  let overlays = [];
  for (const field in sample) {
    const label = sample[field];
    if (!label) {
      continue;
    }
    if (label._cls in FROM_FO) {
      const labelOverlays = FROM_FO[label._cls](field, label, this);
      overlays.forEach((o) => o.setup(context, width, height));
      overlays = [...overlays, ...labelOverlays];
    } else if (label._cls === "Classification") {
      classifications.push([field, [null, [label]]]);
    } else if (label._cls === "Classifications") {
      classifications.push([field, [null, label.classifications]]);
    }
  }

  if (classifications.length > 0) {
    const overlay = new ClassificationsOverlay(classifications, this);
    overlay.setup(context, width, height);
    overlays.push(overlay);
  }
}

function resetCanvas(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  context.clearRect(0, 0, width, height);
  context.strokeStyle = "#fff";
  context.fillStyle = "#fff";
  context.lineWidth = 3;
  context.font = "14px sans-serif";
  // easier for setting offsets
  context.textBaseline = "bottom";
  context;
}
