/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState } from "../../state";
import { BaseElement, Events } from "../base";
import { ICONS } from "../util";
import {
  fullscreen,
  help,
  next,
  previous,
  settings,
  zoomIn,
  zoomOut,
  cropToContent,
  json,
} from "./actions";
import cropIcon from "../../icons/crop.svg";
import jsonIcon from "../../icons/json.svg";

import {
  lookerArrow,
  lookerClickable,
  lookerControlActive,
  lookerControls,
} from "./controls.module.css";

export class NextElement<State extends BaseState> extends BaseElement<
  State,
  HTMLImageElement
> {
  private showControls: boolean;
  getEvents(): Events<State> {
    return {
      click: ({ update, event, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        next.action(update, dispatchEvent, null, true);
      },
      mouseenter: ({ update }) => {
        update({ hoveringControls: true });
      },
      mouseleave: ({ update }) => {
        update({ hoveringControls: false });
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("img");
    element.classList.add(lookerArrow);
    element.src = ICONS.arrowRight;
    element.style.right = "0.5rem";
    return element;
  }

  isShown({ thumbnail }: Readonly<State["config"]>) {
    return !thumbnail;
  }

  renderSelf({
    showControls,
    disableControls,
    options: { hasNext },
  }: Readonly<State>) {
    showControls = showControls && !disableControls && hasNext;
    if (this.showControls === showControls) {
      return this.element;
    }
    if (showControls) {
      this.element.style.opacity = "0.9";
      this.element.style.height = "unset";
      this.element.style.display = "block";
    } else {
      this.element.style.opacity = "0.0";
      this.element.style.height = "0";
      this.element.style.display = "none";
    }
    this.showControls = showControls;
    return this.element;
  }
}

export class PreviousElement<State extends BaseState> extends BaseElement<
  State,
  HTMLImageElement
> {
  private showControls: boolean;
  getEvents(): Events<State> {
    return {
      click: ({ update, event, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        previous.action(update, dispatchEvent, null, true);
      },
      mouseenter: ({ update }) => {
        update({ hoveringControls: true });
      },
      mouseleave: ({ update }) => {
        update({ hoveringControls: false });
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("img");
    element.src = ICONS.arrowLeft;
    element.classList.add(lookerArrow);
    element.style.left = "0.5rem";
    return element;
  }

  isShown({ thumbnail }: Readonly<State["config"]>) {
    return !thumbnail;
  }

  renderSelf({
    showControls,
    disableControls,
    options: { hasPrevious },
  }: Readonly<State>) {
    showControls = showControls && !disableControls && hasPrevious;
    if (this.showControls === showControls) {
      return this.element;
    }
    if (showControls) {
      this.element.style.opacity = "0.9";
      this.element.style.height = "unset";
      this.element.style.display = "block";
    } else {
      this.element.style.opacity = "0.0";
      this.element.style.height = "0";
      this.element.style.display = "none";
    }
    this.showControls = showControls;
    return this.element;
  }
}

export class ControlsElement<State extends BaseState> extends BaseElement<
  State
> {
  private showControls: boolean = false;

  getEvents(): Events<State> {
    return {
      mouseenter: ({ update }) => {
        update({ hoveringControls: true });
      },
      mouseleave: ({ update }) => {
        update({ hoveringControls: false });
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.classList.add(lookerControls);
    return element;
  }

  isShown({ thumbnail }: Readonly<State["config"]>) {
    return !thumbnail;
  }

  renderSelf({
    showControls,
    disableControls,
    error,
    loaded,
  }: Readonly<State>) {
    showControls = showControls && !disableControls && !error && loaded;
    if (this.showControls === showControls) {
      return this.element;
    }
    if (showControls) {
      this.element.style.opacity = "0.9";
      this.element.style.height = "unset";
    } else {
      this.element.style.opacity = "0.0";
      this.element.style.height = "0";
    }
    this.showControls = showControls;
    return this.element;
  }
}

export class FullscreenButtonElement<
  State extends BaseState
> extends BaseElement<State, HTMLImageElement> {
  private fullscreen: boolean;

  getEvents(): Events<State> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        fullscreen.action(update, dispatchEvent);
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("img");
    element.classList.add(lookerClickable);
    element.style.padding = "2px";
    element.style.gridArea = "2 / 12 / 2 / 12";
    return element;
  }

  renderSelf({ options: { fullscreen } }: Readonly<State>) {
    if (this.fullscreen !== fullscreen) {
      this.fullscreen = fullscreen;
      fullscreen
        ? this.element.classList.add(lookerControlActive)
        : this.element.classList.remove(lookerControlActive);
      this.element.src = fullscreen ? ICONS.fullscreenExit : ICONS.fullscreen;
      this.element.title = `Toggle fullscreen (f)`;
    }

    return this.element;
  }
}

export class PlusElement<State extends BaseState> extends BaseElement<
  State,
  HTMLImageElement
> {
  getEvents(): Events<State> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        zoomIn.action(update, dispatchEvent);
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("img");
    element.classList.add(lookerClickable);
    element.style.padding = "2px";
    element.src = ICONS.plus;
    element.title = "Zoom in (+)";
    element.style.gridArea = "2 / 10 / 2 / 10";
    return element;
  }

  renderSelf() {
    return this.element;
  }
}

export class MinusElement<State extends BaseState> extends BaseElement<
  State,
  HTMLImageElement
> {
  getEvents(): Events<State> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        zoomOut.action(update, dispatchEvent);
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("img");
    element.classList.add(lookerClickable);
    element.style.padding = "2px";
    element.src = ICONS.minus;
    element.title = "Zoom out (-)";
    element.style.gridArea = "2 / 9 / 2 / 9";
    return element;
  }

  renderSelf() {
    return this.element;
  }
}

export class HelpButtonElement<State extends BaseState> extends BaseElement<
  State
> {
  private active: boolean;

  getEvents(): Events<State> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        help.action(update, dispatchEvent);
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("img");
    element.classList.add(lookerClickable);
    element.style.padding = "2px";
    element.src = ICONS.help;
    element.title = "Help (?)";
    element.style.gridArea = "2 / 14 / 2 / 14";
    return element;
  }

  renderSelf({ showHelp }) {
    if (this.active !== showHelp) {
      showHelp
        ? this.element.classList.add(lookerControlActive)
        : this.element.classList.remove(lookerControlActive);

      this.active = showHelp;
    }
    return this.element;
  }
}

export class OptionsButtonElement<State extends BaseState> extends BaseElement<
  State
> {
  private active: boolean;

  getEvents(): Events<State> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        settings.action(update, dispatchEvent);
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("img");
    element.classList.add(lookerClickable);
    element.style.padding = "2px";
    element.src = ICONS.options;
    element.title = "Settings (s)";
    element.style.gridArea = "2 / 15 / 2 / 15";
    return element;
  }

  renderSelf({ showOptions }) {
    if (this.active !== showOptions) {
      showOptions
        ? this.element.classList.add(lookerControlActive)
        : this.element.classList.remove(lookerControlActive);
      this.active = showOptions;
    }

    return this.element;
  }
}

export class CropToContentButtonElement<
  State extends BaseState
> extends BaseElement<State> {
  private disabled: boolean;

  getEvents(): Events<State> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        cropToContent.action(update, dispatchEvent);
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("img");
    element.style.padding = "2px";
    element.src = cropIcon;
    element.title = `${cropToContent.title} (${cropToContent.shortcut})`;
    element.style.gridArea = "2 / 11 / 2 / 11";
    return element;
  }

  renderSelf({ disableOverlays }) {
    if (this.disabled !== disableOverlays) {
      this.element.style.opacity = disableOverlays ? "0.5" : "1";
      this.element.style.cursor = disableOverlays ? "unset" : "pointer";
      this.disabled = disableOverlays;
    }

    return this.element;
  }
}

export class JSONButtonElement<State extends BaseState> extends BaseElement<
  State
> {
  private disabled: boolean;
  private active: boolean;

  getEvents(): Events<State> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        json.action(update, dispatchEvent);
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("img");
    element.style.padding = "2px";
    element.src = jsonIcon;
    element.title = `${json.title} (${json.shortcut})`;
    element.style.gridArea = "2 / 13 / 2 / 13";
    return element;
  }

  renderSelf({ disableOverlays, options: { showJSON } }) {
    if (this.disabled !== disableOverlays) {
      this.element.style.opacity = disableOverlays ? "0.5" : "1";
      this.element.style.cursor = disableOverlays ? "unset" : "pointer";
      this.disabled = disableOverlays;
    }

    if (this.active !== showJSON) {
      showJSON
        ? this.element.classList.add(lookerControlActive)
        : this.element.classList.remove(lookerControlActive);
      this.active = showJSON;
    }

    return this.element;
  }
}
