/**
 * Copyright 2017-2021, Voxel51, Inc.
 */
import {} from "immutable";
import mime from "mime-types";

import { asVideo } from "./video";
import Renderer from "./renderers/baseRenderer";
import OverlaysManager from "./overlaysManager";
import { colorGenerator } from "./overlays";
import { FrameState, ImageState, VideoState } from "./state";

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

interface Sample {
  [key: string]: object;
}

export default class Player51 {
  src: string;
  mimeType?: string;
  options: typeof defaults = defaults;
  overlaysManager: OverlaysManager;

  private renderTree: Renderer;
  private eventTarget: EventTarget;
  private state: FrameState | ImageState | VideoState;

  constructor({ src, ...options }) {
    this.eventTarget = new EventTarget();
    this.state;
  }

  addEventListener(eventType, handler, ...args) {
    this.eventTarget.addEventListener(eventType, handler, ...args);
  }

  removeEventListener(eventType, handler, ...args) {
    this.eventTarget.removeEventListener(eventType, handler, ...args);
  }

  focus(): void {
    focusedInstance = this;
  }

  blur(): void {
    focusedInstance === this && (focusedInstance = null);
  }

  destroy(): void {
    instances = instances.filter((player) => player !== this);
    if (focusedInstance === this) {
      focusedInstance = null;
    }
    this.renderer.destroy();
    delete this.renderer;
  }

  update({ sample, src, rest }) {
    Object.assign(this.options, rest);
  }
}
