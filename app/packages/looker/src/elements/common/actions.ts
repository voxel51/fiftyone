/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { SCALE_FACTOR } from "../../constants";
import { BaseState, StateUpdate, VideoState } from "../../state";
import { clampScale } from "../../util";
import { BaseElement, DispatchEvent, Events } from "../base";
import { getFrameNumber } from "../util";
import { dispatchTooltipEvent } from "./util";

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

export const controls: Control = {
  title: "Show controls",
  shortcut: "c",
  detail: "Show the conrols bar and navigation arrows",
  action: (update) => {
    update(({ config: { thumbnail }, showControls }) => {
      if (thumbnail) {
        return {};
      }

      return {
        showControls: !showControls,
        showHelp: false,
        disableControls: showControls,
        showOptions: false,
      };
    });
  },
};

export const next: Control = {
  title: "Next sample",
  shortcut: "&#8594;",
  eventKey: "ArrowRight",
  detail: "Go to the next sample",
  action: (_, dispatchEvent) => {
    dispatchEvent("next");
  },
};

export const previous: Control = {
  title: "Previous sample",
  shortcut: "&#8592;",
  eventKey: "ArrowLeft",
  detail: "Go to the previous sample",
  action: (_, dispatchEvent) => {
    dispatchEvent("previous");
  },
};

export const rotatePrevious: Control = {
  title: "Rotate label forward",
  shortcut: "&#8595;",
  eventKey: "ArrowUp",
  detail: "Rotate the bottom label to the back",
  action: () => {},
};

export const rotateNext: Control = {
  title: "Rotate label backward",
  shortcut: "&#8593;",
  eventKey: "ArrowDown",
  detail: "Rotate the current label to the back",
  action: () => {},
};

export const help: Control = {
  title: "Display help",
  shortcut: "?",
  detail: "Display this help window",
  action: (update) => {
    update(({ showHelp, config: { thumbnail } }) =>
      thumbnail ? {} : { showHelp: !showHelp }
    );
  },
};

export const zoomIn: Control = {
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

export const zoomOut: Control = {
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

export const settings: Control = {
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

export const fullscreen: Control = {
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

export const COMMON_SHORTCUTS = Object.fromEntries(
  Object.entries(COMMON).map(([_, v]) => [v.eventKey || v.shortcut, v])
);

export const nextFrame: Control<VideoState> = {
  title: "Next frame",
  shortcut: ".",
  detail: "Seek to the next frame",
  action: (update) => {
    update(
      ({
        frameNumber,
        duration,
        playing,
        config: { frameRate },
        config: { thumbnail },
      }) => {
        if (playing || thumbnail) {
          return {};
        }
        duration = duration as number;
        const total = getFrameNumber(duration, duration, frameRate);

        if (frameNumber === total) {
          frameNumber = 1;
        } else {
          frameNumber += 1;
        }
        return { frameNumber };
      }
    );
  },
};

export const previousFrame: Control<VideoState> = {
  title: "Previous frame",
  shortcut: ",",
  detail: "Seek to the previous frame",
  action: (update) => {
    update(({ frameNumber, playing, config: { thumbnail } }) => {
      if (playing || thumbnail) {
        return {};
      }

      return { frameNumber: Math.max(1, frameNumber - 1) };
    });
  },
};

export const playPause: Control<VideoState> = {
  title: "Play / pause",
  shortcut: "Space",
  eventKey: " ",
  detail: "Play or pause the video",
  action: (update, dispatchEvent) => {
    update(({ playing, config: { thumbnail } }) => {
      if (playing) {
        dispatchTooltipEvent(dispatchEvent, true);
      }

      return thumbnail
        ? {}
        : {
            playing: !playing,
            tooltipDisabled: !playing,
          };
    });
  },
};

export const VIDEO = {
  playPause,
  nextFrame,
  previousFrame,
};

export const VIDEO_SHORTCUTS = Object.fromEntries(
  Object.entries(VIDEO).map(([_, v]) => [v.eventKey || v.shortcut, v])
);

export class HelpPanelElement<State extends BaseState> extends BaseElement<
  State
> {
  private showHelp?: boolean;
  protected items?: HTMLDivElement;

  getEvents(): Events<State> {
    return {
      click: ({ event, update }) => {
        event.stopPropagation();
        event.preventDefault();
        update({ showHelp: false });
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
    header.style.marginBottom = "0.5rem";
    header.style.fontSize = "18px";
    header.style.paddingBottom = "0.5rem";
    header.style.borderBottom = "2px solid rgb(225, 100, 40)";
    header.innerText = "Actions and shortcuts";
    element.appendChild(header);
    element.className = "looker-help-panel";

    const container = document.createElement("div");
    container.style.position = "absoulte";
    container.style.top = "0";
    container.style.left = "0";
    container.style.height = "100%";
    container.style.width = "100%";
    container.style.display = "flex";
    container.style.justifyContent = "center";
    container.style.padding = "10px 20px 50px";

    const vContainer = document.createElement("div");
    vContainer.style.display = "flex";
    vContainer.style.flexDirection = "column";
    vContainer.style.justifyContent = "center";

    vContainer.appendChild(element);

    container.appendChild(vContainer);

    const items = document.createElement("div");
    items.style.padding = "1rem 0 0 0";
    items.style.margin = "0";
    items.style.display = "grid";
    items.style.gridTemplateColumns = "1fr 1fr";
    items.style.gridRowGap = "1rem";
    items.style.gridColumnGap = "1rem";
    this.items = items;

    Object.values(COMMON).forEach(addItem(items));

    element.appendChild(items);

    return container;
  }

  isShown({ config: { thumbnail } }: Readonly<State>) {
    return !thumbnail;
  }

  renderSelf({ showHelp, config: { thumbnail } }: Readonly<State>) {
    if (thumbnail) {
      return this.element;
    }
    if (this.showHelp === showHelp) {
      return this.element;
    }
    if (showHelp) {
      this.element.style.opacity = "0.9";
      this.element.style.display = "flex";
    } else {
      this.element.style.opacity = "0.0";
      this.element.style.display = "none";
    }
    this.showHelp = showHelp;
    return this.element;
  }
}

export class VideoHelpPanelElement<
  State extends VideoState
> extends HelpPanelElement<State> {
  createHTMLElement() {
    const element = super.createHTMLElement();

    Object.values(VIDEO).forEach(addItem(this.items as HTMLDivElement));

    return element;
  }
}

const addItem = (items: HTMLDivElement) => (value: Control<VideoState>) => {
  const item = document.createElement("div");
  item.innerHTML = `
    <div class="looker-shortcut-item">
      <div class="looker-shortcut-value">${value.shortcut}</div>
      <div class="looker-shortcut-title">${value.title}</div>
      <div class="looker-shortcut-detail">${value.detail}</div>
    </div>
  `;
  items.appendChild(item);
};
