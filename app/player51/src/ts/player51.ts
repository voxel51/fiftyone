/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import mime from "mime-types";

import { Video } from "./video.js";
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

const handleGlobalKeyboard = (e) => {
  if (focusedInstance && focusedInstance.renderer._handleKeyboardEvent(e)) {
    e.preventDefault();
    e.stopPropagation();
  }
};

const handleGlobalClick = (e) => {
  for (const player of instances) {
    if (player.renderer.parent && player.renderer.parent.contains(e.target)) {
      focusedInstance = player;
      return;
    }
  }
  focusedInstance && focusedInstance.renderer._handleFocusLost();
  focusedInstance = null;
};

const installEventHandlers = () => {
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
      return Video.call(this);
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

  dynamicRender() {
    this.renderer.setPlayer(this);
    this.renderer.initSharedControls();
    this.renderer.initPlayerControls();
  }

  staticRender(parentElement) {
    this.renderer.setParentofMedia(parentElement);
    this.renderer.initPlayer();
    this.renderer._isRendered = true;
  }

  render(parentElement) {
    this.staticRender(parentElement);
    this.dynamicRender();
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
