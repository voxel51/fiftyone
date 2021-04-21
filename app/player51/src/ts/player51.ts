/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import mime from "mime-types";

import { asVideo } from "./video.js";
import Renderer from "./renderers/renderer";
import { colorGenerator } from "./overlay.js";

export { ColorGenerator } from "./overlay.js";

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
    if (player.renderer.parent && player.renderer.parent.contains(e.target)) {
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
  sample: Sample;
  src: string;
  options: typeof defaults;
  renderer: Renderer;

  constructor({ sample, src, ...rest }) {
    this.sample = sample;
    this.src = src;
    this.options = Object.assign({}, defaults, rest);
    !installedEventHandlers && installEventHandlers();
    const mimeType =
      (sample.metadata && sample.metadata.mime_type) ||
      mime.lookup(sample.filepath) ||
      "image/jpg";

    if (mimeType.startsWith("video/")) {
      return asVideo.call(this);
    }

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

  grabKeyboardFocus(grab = true) {
    focusedInstance = grab ? this : null;
  }

  destroy() {
    instances = instances.filter((player) => player !== this);
    if (focusedInstance === this) {
      focusedInstance = null;
    }
    this.renderer.destroy();
    delete this.renderer;
  }

  render(parentElement) {
    this.renderer.setParentofMedia(parentElement);
    this.renderer.initPlayer();
    this.renderer._isRendered = true;
    this.renderer.initSharedControls();
    this.renderer.initPlayerControls();
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
