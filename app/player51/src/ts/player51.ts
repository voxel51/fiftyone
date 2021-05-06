/**
 * Copyright 2017-2021, Voxel51, Inc.
 */
import { fromJS } from "immutable";
import mime from "mime-types";

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

  private eventTarget: EventTarget;
  private state: FrameState | ImageState | VideoState;

  constructor(config, options) {
    this.eventTarget = new EventTarget();
    this.state = fromJS({
      config,
      options,
    });
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

  update(options) {
    this.state = fromJS({
      config: this.state.config,
      options,
    });
  }
}
