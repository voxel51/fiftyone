/**
 * Copyright 2017-2021, Voxel51, Inc.
 */
import { fromJS, mergeDeep } from "immutable";

import OverlaysManager from "./overlaysManager";
import { colorGenerator } from "./overlays";
import { Kind, getKind, FrameState, ImageState, VideoState } from "./state";
import { getElements } from "./elements";
import { LookerElement } from "./elements/common";

export { ColorGenerator } from "./overlays";

export default class Looker {
  src: string;
  mimeType?: string;
  kind: Kind;
  options: typeof defaults = defaults;
  overlaysManager: OverlaysManager;

  private eventTarget: EventTarget;
  private state: FrameState | ImageState | VideoState;
  private lookerElement: LookerElement;
  private canvas: HTMLCanvasElement;

  constructor(sample: any, config, options) {
    this.eventTarget = new EventTarget();
    this.kind = getKind(sample.metadata.mime_type);
    this.state = fromJS({
      config,
      options,
    });

    const update = this.makeUpdater(this.kind);
    this.lookerElement = getElements(this.kind, update, this.dispatchEvent);
    this.canvas = this.lookerElement.element.querySelector("canvas");
  }

  private makeUpdater(kind) {
    const makeUpdate = function <State>(
      state: State
    ): (
      stateOrUpdate: Readonly<State> | ((state: Readonly<State>) => State)
    ) => void {
      return (stateOrUpdater: SU | ((state: SR) => SU)) => {
        const updates =
          stateOrUpdater instanceof Function
            ? stateOrUpdater(this.state)
            : stateOrUpdater;
        this.state = mergeDeep<S>(this.state as S, updates);
        this.lookerElement.render(this.state as SR);
      };
    };
    switch (kind) {
      case Kind.Frame: {
        return (
          stateOrUpdater:
            | FrameStateUpdate
            | ((state: FrameStateReadOnly) => FrameStateUpdate)
        ) => {
          const updates =
            stateOrUpdater instanceof Function
              ? stateOrUpdater(this.state as FrameStateReadOnly)
              : stateOrUpdater;
          this.state = mergeDeep<FrameState>(this.state, updates);
          this.lookerElement.render(this.state);
        };
      }
      case Kind.Image: {
        return (
          stateOrUpdater:
            | ImageStateUpdate
            | ((state: ImageStateReadOnly) => ImageStateUpdate)
        ) => {
          const updates =
            stateOrUpdater instanceof Function
              ? stateOrUpdater(this.state)
              : stateOrUpdater;
          this.state = mergeDeep<ImageState>(this.state as ImageState, updates);
          this.lookerElement.render(this.state as ImageStateReadOnly);
        };
      }
      case Kind.Video: {
      }
      default: {
        throw new Error(`No elements tree found for kind: ${kind}`);
      }
    }
  }

  private dispatchEvent(eventType: string, detail: any) {
    this.eventTarget.dispatchEvent(new CustomEvent(eventType, { detail }));
  }

  addEventListener(eventType, handler, ...args) {
    this.eventTarget.addEventListener(eventType, handler, ...args);
  }

  removeEventListener(eventType, handler, ...args) {
    this.eventTarget.removeEventListener(eventType, handler, ...args);
  }

  destroy(): void {}

  update(sample, options) {
    this.state = fromJS({
      ...this.state,
      sample,
      config: this.state.config,
      options,
    });
  }
}
