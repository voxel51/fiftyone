/**
 * Copyright 2017-2021, Voxel51, Inc.
 */
import { fromJS, mergeDeep } from "immutable";
import mime from "mime-types";

import OverlaysManager from "./overlaysManager";
import { colorGenerator } from "./overlays";
import {
  Kind,
  getKind,
  FrameState,
  FrameStateUpdate,
  ImageState,
  ImageStateUpdate,
  VideoState,
  VideoStateUpdate,
} from "./state";
import { getElements } from "./elements";
import { isFunction } from "./util";
import { LookerElement } from "./elements/common";

export { ColorGenerator } from "./overlays";

const defaults = {
  colorMap: {},
  colorByLabel: {},
  activeFields: {},
  filter: {},
  enableOverlayOptions: {},
  overlayOptions: {
    showAttrs: false,
    showTooltip: true,
    showConfidence: true,
  },
  selectedLabels: [],
  colorGenerator,
};

export default class Looker {
  src: string;
  mimeType?: string;
  kind: Kind;
  options: typeof defaults = defaults;
  overlaysManager: OverlaysManager;

  private eventTarget: EventTarget;
  private state: FrameState | ImageState | VideoState;
  private lookerElement: LookerElement;

  constructor(sample: any, config, options) {
    this.eventTarget = new EventTarget();
    this.state = fromJS({
      config,
      options,
    });

    this.kind = getKind(sample.metadata.mime_type);
    const update = this.makeUpdater(this.kind);
    this.lookerElement = getElements(this.kind, update, this.dispatchEvent);
  }

  private makeUpdater(kind) {
    switch (kind) {
      case Kind.Frame: {
        return (
          stateOrUpdater:
            | FrameStateUpdate
            | ((state: FrameState) => FrameStateUpdate)
        ) => {
          const updates =
            stateOrUpdater instanceof Function
              ? stateOrUpdater(this.state)
              : stateOrUpdater;
          this.state = mergeDeep<FrameState>(this.state, updates);
          this.lookerElement.render<FrameState>(this.state);
        };
      }
      case Kind.Image: {
        return (
          stateOrUpdater:
            | ImageStateUpdate
            | ((state: ImageState) => ImageStateUpdate)
        ) => {
          const updates =
            stateOrUpdater instanceof Function
              ? stateOrUpdater(this.state)
              : stateOrUpdater;
          this.state = mergeDeep<ImageState>(this.state, updates);
          this.lookerElement.render<ImageState>(this.state);
        };
      }
      case Kind.Video: {
        return getVideoElements(update, dispatchEvent);
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
