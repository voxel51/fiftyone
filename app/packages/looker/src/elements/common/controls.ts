/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState } from "../../state";
import { BaseElement, Events } from "../base";
import { ICONS } from "../util";
import {
  next,
  previous,
  toggleHelp,
  toggleOptions,
  zoomIn,
  zoomOut,
} from "./actions";

export class NextElement<State extends BaseState> extends BaseElement<
  State,
  HTMLImageElement
> {
  private showControls: boolean;
  getEvents(): Events<State> {
    return {
      click: ({ event, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        next(dispatchEvent);
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
    element.className = "looker-arrow";
    element.src = ICONS.arrowRight;
    element.style.right = "0.5rem";
    return element;
  }

  isShown({ config: { thumbnail }, options: { hasNext } }) {
    return !thumbnail && hasNext;
  }

  renderSelf({ showControls, disableControls, config: { thumbnail } }) {
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
  private showControls: boolean;
  getEvents(): Events<State> {
    return {
      click: ({ event, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        previous(dispatchEvent);
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
    element.className = "looker-arrow";
    element.style.left = "0.5rem";
    return element;
  }

  isShown({ config: { thumbnail }, options: { hasPrevious } }) {
    return !thumbnail && hasPrevious;
  }

  renderSelf({ showControls, disableControls, config: { thumbnail } }) {
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
  private showControls: boolean;

  getEvents(): Events<State> {
    return {
      click: ({ event, update }) => {
        event.stopPropagation();
        update({
          showControls: false,
          disableControls: true,
          showOptions: false,
        });
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
    element.className = "looker-controls";
    return element;
  }

  isShown({ config: { thumbnail } }) {
    return !thumbnail;
  }

  renderSelf({ showControls, disableControls, config: { thumbnail } }) {
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
  private fullscreen: boolean;

  getEvents(): Events<State> {
    return {
      click: ({ event, update }) => {
        event.stopPropagation();
        event.preventDefault();
        update(({ fullscreen }) => ({ fullscreen: !fullscreen }));
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("img");
    element.className = "looker-clickable";
    element.style.gridArea = "2 / 7 / 2 / 7";
    return element;
  }

  renderSelf({ fullscreen }) {
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
      click: ({ event, update }) => {
        event.stopPropagation();
        event.preventDefault();
        zoomIn(update);
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("img");
    element.className = "looker-clickable";
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
      click: ({ event, update }) => {
        event.stopPropagation();
        event.preventDefault();
        zoomOut(update);
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("img");
    element.className = "looker-clickable";
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
      click: ({ event, update }) => {
        event.stopPropagation();
        event.preventDefault();
        toggleHelp(update);
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("img");
    element.className = "looker-clickable";
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
      click: ({ event, update }) => {
        event.stopPropagation();
        event.preventDefault();
        toggleOptions(update);
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("img");
    element.className = "looker-clickable";
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
