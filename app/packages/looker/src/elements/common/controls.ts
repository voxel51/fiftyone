/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import {
  crop,
  help as helpIcon,
  json as jsonIcon,
  minus,
  options,
  overlaysHidden,
  overlaysVisible,
  plus,
} from "../../icons";
import { BaseState } from "../../state";
import { BaseElement, Events } from "../base";
import {
  cropToContent,
  help,
  json,
  settings,
  toggleOverlays,
  zoomIn,
  zoomOut,
} from "./actions";

import {
  lookerClickable,
  lookerControlActive,
  lookerControls,
} from "./controls.module.css";

export class ControlsElement<
  State extends BaseState
> extends BaseElement<State> {
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
    element.setAttribute("data-cy", "looker-controls");
    element.classList.add(lookerControls);
    return element;
  }

  isShown({ thumbnail }: Readonly<State["config"]>) {
    return !thumbnail;
  }

  renderSelf({
    options: { showControls },
    disableControls,
    error,
    loaded,
  }: Readonly<State>) {
    showControls = showControls && !disableControls && !error && loaded;
    if (this.showControls === showControls) {
      return this.element;
    }
    if (showControls) {
      this.element.style.opacity = "0.95";
      this.element.style.height = "unset";
    } else {
      this.element.style.opacity = "0.0";
      this.element.style.height = "0";
    }
    this.showControls = showControls;
    return this.element;
  }
}

export class ToggleOverlaysButtonElement<
  State extends BaseState
> extends BaseElement<State, HTMLImageElement> {
  private overlaysVisible: boolean;

  getEvents(): Events<State> {
    const afterAction = ({ event, update, dispatchEvent }) => {
      event.stopPropagation();
      event.preventDefault();
      toggleOverlays.afterAction(update, dispatchEvent);
    };
    return {
      mousedown: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        toggleOverlays.action(update, dispatchEvent);
      },
      mouseup: afterAction,
      mouseout: afterAction,
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.classList.add(lookerClickable);
    element.style.padding = "2px";
    element.style.display = "flex";
    element.style.gridArea = "2 / 14 / 2 / 14";
    return element;
  }

  renderSelf({ options: { showOverlays } }: Readonly<State>) {
    if (this.overlaysVisible !== showOverlays) {
      this.overlaysVisible = showOverlays;

      this.element.title = `Hold down to hide all overlays (shift)`;
      this.element.classList.remove(lookerControlActive);

      if (this.element.firstChild) this.element.firstChild.remove();
      this.element.appendChild(showOverlays ? overlaysHidden : overlaysVisible);
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
    const element = document.createElement("div");
    element.classList.add(lookerClickable);
    element.style.padding = "2px";
    element.style.display = "flex";
    element.title = "Zoom in (+)";
    element.style.gridArea = "2 / 10 / 2 / 10";
    element.appendChild(plus);
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
    const element = document.createElement("div");
    element.classList.add(lookerClickable);
    element.style.padding = "2px";
    element.style.display = "flex";
    element.title = "Zoom out (-)";
    element.style.gridArea = "2 / 9 / 2 / 9";
    element.appendChild(minus);
    return element;
  }

  renderSelf() {
    return this.element;
  }
}

export class HelpButtonElement<
  State extends BaseState
> extends BaseElement<State> {
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
    const element = document.createElement("div");
    element.classList.add(lookerClickable);
    element.style.padding = "2px";
    element.style.display = "flex";
    element.title = "Help (?)";
    element.style.gridArea = "2 / 16 / 2 / 16";
    element.setAttribute("data-for-panel", "help");
    element.appendChild(helpIcon);
    return element;
  }

  renderSelf({ options: { showHelp } }) {
    if (this.active !== showHelp) {
      showHelp
        ? this.element.classList.add(lookerControlActive)
        : this.element.classList.remove(lookerControlActive);

      this.active = showHelp;
    }
    return this.element;
  }
}

export class OptionsButtonElement<
  State extends BaseState
> extends BaseElement<State> {
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
    const element = document.createElement("div");
    element.setAttribute("data-cy", "looker-controls-settings");
    element.classList.add(lookerClickable);
    element.style.padding = "2px";
    element.style.display = "flex";
    element.title = "Preferences (p)";
    element.style.gridArea = "2 / 15 / 2 / 15";
    element.appendChild(options);
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
    const element = document.createElement("div");
    element.style.padding = "2px";
    element.style.display = "flex";
    element.title = `${cropToContent.title} (${cropToContent.shortcut})`;
    element.style.gridArea = "2 / 11 / 2 / 11";
    element.appendChild(crop);
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

export class JSONButtonElement<
  State extends BaseState
> extends BaseElement<State> {
  private disabled: boolean;
  private active: boolean;

  getEvents(): Events<State> {
    return {
      mousedown: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        json.action(update, dispatchEvent);
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.style.padding = "2px";
    element.style.display = "flex";
    element.title = `${json.title} (${json.shortcut})`;
    element.style.gridArea = "2 / 13 / 2 / 13";
    element.setAttribute("data-for-panel", "json");
    element.appendChild(jsonIcon);
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
