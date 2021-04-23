/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import mime from "mime-types";

import { asVideo } from "./video";
import Renderer from "./renderers/baseRenderer";
import OverlaysManager from "./overlaysManager";
import { colorGenerator } from "./overlays";

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

let installedEventHandlers = false;
let instances: Player51[] = [];
let focusedInstance = null;

const handleGlobalKeyboard = (e: MouseEvent): void => {
  if (focusedInstance && focusedInstance.renderer._handleKeyboardEvent(e)) {
    e.preventDefault();
    e.stopPropagation();
  }
};

const handleGlobalClick = (e: MouseEvent): void => {
  for (const player of instances) {
    if (
      player.renderer.parent &&
      player.renderer.parent.contains(<Node>e.target)
    ) {
      focusedInstance = player;
      return;
    }
  }
  focusedInstance && focusedInstance.renderer._handleFocusLost();
  focusedInstance = null;
};

const installEventHandlers = (): void => {
  window.addEventListener("click", handleGlobalClick);
  window.addEventListener("keydown", handleGlobalKeyboard);
  installedEventHandlers = true;
};

interface Sample {
  [key: string]: object;
}

export default class Player51 {
  src: string;
  mimeType?: string;
  options: typeof defaults = defaults;
  overlaysManager: OverlaysManager;
  renderer: Renderer;

  constructor({ src, ...options }) {
    !installedEventHandlers && installEventHandlers();

    instances.push(this);
  }

  addEventListener(eventType, handler, ...args) {
    this.renderer.eventTarget.addEventListener(eventType, handler, ...args);
  }

  removeEventListener(eventType, handler, ...args) {
    this.renderer &&
      this.renderer.eventTarget.removeEventListener(
        eventType,
        handler,
        ...args
      );
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
    sample && (this.sample = sample);
    src && (this.src = src);
    this.renderer.eleOptCtlShowAttr.checked = this.options.overlayOptions.showAttrs;
    this.renderer.eleOptCtlShowConfidence.checked = this.options.overlayOptions.showConfidence;
    this.renderer.eleOptCtlShowTooltip.checked = this.options.overlayOptions.showTooltip;
    this.renderer.processFrame();
  }
}
