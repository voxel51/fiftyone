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
  Optional,
  LookerProps,
} from "./state";
import {
  GetElements,
  getFrameElements,
  getImageElements,
  getVideoElements,
} from "./elements";
import { LookerElement } from "./elements/common";

export { ColorGenerator } from "./overlays";

type Sample = any;

abstract class Looker<Props extends LookerProps, State extends BaseState> {
  private eventTarget: EventTarget;
  private state: State;
  private lookerElement: LookerElement<State>;
  protected readonly updater: StateUpdate<State>;
  protected readonly getElements: GetElements<State>;
  private readonly canvas: HTMLCanvasElement;
  private sample: Sample;

  constructor({ sample, config, options }: Props) {
    this.eventTarget = new EventTarget();
    this.state = fromJS({
      config,
      options,
    });

    this.sample = sample;

    this.lookerElement = this.getElements(this.updater, this.dispatchEvent);
    this.canvas = this.lookerElement.element.querySelector("canvas");
    this.update = this.makeUpdate();
  }

  protected dispatchEvent(eventType: string, detail: any) {
    this.eventTarget.dispatchEvent(new CustomEvent(eventType, { detail }));
  }

  private makeUpdate() {
    return (
      stateOrUpdater:
        | Optional<State>
        | ((state: Readonly<State>) => Optional<State>)
    ) => {
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

  update(sample: Sample, options: State["options"]) {
    this.sample = sample;
    this.updater({ options });
  }
}

export class FrameLooker extends Looker<FrameLookerProps, FrameState> {
  protected readonly getElements = getFrameElements;

  constructor(props: FrameLookerProps) {
    super(props);
  }
}

export class ImageLooker extends Looker<ImageLookerProps, ImageState> {
  protected readonly getElements = getImageElements;

  constructor(props: ImageLookerProps) {
    super(props);
  }
}

export class VideoLooker extends Looker<VideoLookerProps, VideoState> {
  protected readonly getElements = getVideoElements;

  constructor(props: VideoLookerProps) {
    super(props);
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
