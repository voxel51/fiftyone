/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState } from "../../state";
import { BaseElement, Events } from "../base";
import { ICONS } from "../util";
import {
  controls,
  fullscreen,
  help,
  next,
  previous,
  settings,
  zoomIn,
  zoomOut,
} from "./actions";

import {
  lookerArrow,
  lookerClickable,
  lookerControls,
} from "./controls.module.css";

export class NextElement<State extends BaseState> extends BaseElement<
  State,
  HTMLImageElement
> {
  private showControls: boolean = false;
  getEvents(): Events<State> {
    return {
      click: ({ update, event, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        next.action(update, dispatchEvent);
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

  isShown({ config: { thumbnail }, options: { hasNext } }: Readonly<State>) {
    return !thumbnail && hasNext;
  }

  renderSelf({
    showControls,
    disableControls,
    config: { thumbnail },
  }: Readonly<State>) {
    if (thumbnail) {
      return this.element;
    }
    showControls = showControls && !disableControls;
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

export class PreviousElement<State extends BaseState> extends BaseElement<
  State,
  HTMLImageElement
> {
  private showControls: boolean = false;
  getEvents(): Events<State> {
    return {
      click: ({ update, event, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        previous.action(update, dispatchEvent);
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

  isShown({
    config: { thumbnail },
    options: { hasPrevious },
  }: Readonly<State>) {
    return !thumbnail && hasPrevious;
  }

  renderSelf({
    showControls,
    disableControls,
    config: { thumbnail },
  }: Readonly<State>) {
    if (thumbnail) {
      return this.element;
    }
    showControls = showControls && !disableControls;
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

export class ControlsElement<State extends BaseState> extends BaseElement<
  State
> {
  private showControls: boolean = false;

  getEvents(): Events<State> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        controls.action(update, dispatchEvent);
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
    const element = document.createElement("div");
    element.classList.add(lookerControls);
    return element;
  }

  isShown({ config: { thumbnail } }: Readonly<State>) {
    return !thumbnail;
  }

  renderSelf({
    showControls,
    disableControls,
    config: { thumbnail },
  }: Readonly<State>) {
    if (thumbnail) {
      return this.element;
    }
    showControls = showControls && !disableControls;
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
  private fullscreen: boolean = false;

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
    element.style.gridArea = "2 / 7 / 2 / 7";
    return element;
  }

  renderSelf({ fullscreen }: Readonly<State>) {
    if (this.fullscreen !== fullscreen) {
      this.fullscreen = fullscreen;
      this.element.src = fullscreen ? ICONS.fullscreenExit : ICONS.fullscreen;
      this.element.title = `${fullscreen ? "Minimize" : "Maximize"} (m)`;
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
    element.style.gridArea = "2 / 6 / 2 / 6";
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
    element.style.gridArea = "2 / 5 / 2 / 5";
    return element;
  }

  renderSelf() {
    return this.element;
  }
}

export class HelpButtonElement<State extends BaseState> extends BaseElement<
  State
> {
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
    element.style.gridArea = "2 / 8 / 2 / 8";
    return element;
  }

  renderSelf() {
    return this.element;
  }
}

export class OptionsButtonElement<State extends BaseState> extends BaseElement<
  State
> {
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
    element.style.gridArea = "2 / 9 / 2 / 9";
    return element;
  }

  renderSelf() {
    return this.element;
  }
}
