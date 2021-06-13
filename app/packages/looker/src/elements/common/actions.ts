/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { SCALE_FACTOR } from "../../constants";
import { BaseState, StateUpdate, VideoState } from "../../state";
import { clampScale } from "../../util";
import { BaseElement, DispatchEvent, Events } from "../base";

type Action<State extends BaseState> = (
  update: StateUpdate<State>,
  dispatchEvent: DispatchEvent
) => void;

interface Control<State extends BaseState = BaseState> {
  eventKey?: string;
  title: string;
  shortcut: string;
  detail: string;
  action: Action<State>;
}

const next: Control = {
  title: "Next sample",
  shortcut: "&#8594;",
  detail: "Go to the next sample",
  action: (_, dispatchEvent) => {
    dispatchEvent("next");
  },
};

const previous: Control = {
  title: "Previous sample",
  shortcut: "&#8592;",
  detail: "Go to the previous sample",
  action: (_, dispatchEvent) => {
    dispatchEvent("previous");
  },
};

const rotatePrevious: Control = {
  title: "Rotate label forward",
  shortcut: "&#8595;",
  detail: "Rotate the bottom label to the back",
  action: () => {},
};

const rotateNext: Control = {
  title: "Rotate label backward",
  shortcut: "&#8593;",
  detail: "Rotate the current label to the back",
  action: () => {},
};

const help: Control = {
  title: "Display help",
  shortcut: "?",
  detail: "Display this help window",
  action: (update) => {
    update(({ showHelp, config: { thumbnail } }) =>
      thumbnail ? {} : { showHelp: !showHelp }
    );
  },
};

const zoomIn: Control = {
  title: "Zoom in",
  shortcut: "+",
  detail: "Zoom in on the sample",
  action: (update) => {
    update(
      ({ scale, windowBBox: [_, __, ww, wh], config: { dimensions } }) => ({
        scale: clampScale([ww, wh], dimensions, scale * SCALE_FACTOR),
      })
    );
  },
};

const zoomOut: Control = {
  title: "Zoom out",
  shortcut: "-",
  detail: "Zoom out on the sample",
  action: (update) => {
    update(
      ({ scale, windowBBox: [_, __, ww, wh], config: { dimensions } }) => ({
        scale: clampScale([ww, wh], dimensions, scale / SCALE_FACTOR),
      })
    );
  },
};

const settings: Control = {
  title: "Settings",
  shortcut: "s",
  detail: "Show the settings panel",
  action: (update) => {
    update(({ showOptions, loaded, config: { thumbnail } }) => {
      if (thumbnail) {
        return {};
      } else if (showOptions) {
        return {
          showOptions: false,
        };
      } else {
        return {
          showControls: loaded,
          showOptions: loaded,
        };
      }
    });
  },
};

const fullscreen: Control = {
  title: "Fullscreen",
  shortcut: "f",
  detail: "Toggle fullscreen mode",
  action: (update) => {
    update(({ fullscreen, config: { thumbnail } }) =>
      thumbnail ? {} : { fullscreen: !fullscreen }
    );
  },
};

export const COMMON = {
  next,
  previous,
  rotateNext,
  rotatePrevious,
  help,
  zoomIn,
  zoomOut,
  settings,
  fullscreen,
};

const nextFrame: Control<VideoState> = {
  title: "Next frame",
  shortcut: ".",
  detail: "Seek to the next frame",
  action: (update) => {},
};

const previousFrame: Control<VideoState> = {
  title: "Previous frame",
  shortcut: ",",
  detail: "Seek to the previous frame",
  action: (update) => {},
};

const playPause: Control = {
  title: "Play / pause",
  shortcut: "Space",
  eventKey: " ",
  detail: "Play or pause the video",
  action: (update) => {},
};

export const VIDEO = {
  playPause,
  nextFrame,
  previousFrame,
};

export class HelpPanelElement<State extends BaseState> extends BaseElement<
  State
> {
  private showHelp: boolean;
  getEvents(): Events<State> {
    return {
      click: ({ event }) => {
        event.stopPropagation();
        event.preventDefault();
      },
      dblclick: ({ event }) => {
        event.stopPropagation();
        event.preventDefault();
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    const header = document.createElement("div");
    header.style.paddingBottom = "0.5rem";
    header.innerText = "Shortcuts";
    element.appendChild(header);
    element.className = "looker-help-panel";
    return element;
  }

  isShown({ config: { thumbnail } }) {
    return !thumbnail;
  }

  renderSelf({ showHelp, config: { thumbnail } }) {
    if (thumbnail) {
      return this.element;
    }
    if (this.showHelp === showHelp) {
      return this.element;
    }
    if (showHelp) {
      this.element.style.opacity = "0.9";
      this.element.classList.remove("looker-display-none");
    } else {
      this.element.style.opacity = "0.0";
      this.element.classList.add("looker-display-none");
    }
    this.showHelp = showHelp;
    return this.element;
  }
}
