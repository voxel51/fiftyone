/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { SCALE_FACTOR } from "../../constants";
import { BaseState, StateUpdate, VideoState } from "../../state";
import { clampScale } from "../../util";
import { BaseElement, DispatchEvent, Events } from "../base";
import { getFrameNumber } from "../util";

import {
  lookerHelpPanel,
  lookerHelpPanelContainer,
  lookerHelpPanelHeader,
  lookerHelpPanelItems,
  lookerHelpPanelVerticalContainer,
  lookerShortcutItem,
  lookerShortcutValue,
  lookerShortcutTitle,
  lookerShortcutDetail,
} from "./actions.module.css";
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
  action: (update, dispatchEvent) =>
    update(
      ({ disableOverlays, rotate }) => {
        if (!disableOverlays) {
          return { rotate: Math.max(0, rotate - 1) };
        }
        return {};
      },
      (state, overlays) => {
        dispatchTooltipEvent(dispatchEvent)(state, overlays);
      }
    ),
};

export const rotateNext: Control = {
  title: "Rotate label backward",
  shortcut: "&#8593;",
  eventKey: "ArrowDown",
  detail: "Rotate the current label to the back",
  action: (update, dispatchEvent) =>
    update(
      ({ disableOverlays, rotate }) => {
        if (!disableOverlays) {
          return {
            rotate: rotate + 1,
          };
        }
        return {};
      },
      (state, overlays) => {
        dispatchTooltipEvent(dispatchEvent)(state, overlays);
      }
    ),
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
  title: "Zoom (scroll) in",
  shortcut: "+",
  detail: "Zoom in on the sample",
  action: (update) => {
    update(
      ({
        scale,
        windowBBox: [_, __, ww, wh],
        config: { dimensions },
        pan: [px, py],
      }) => {
        const x = ww / 2;
        const y = wh / 2;

        const xs = (x - px) / scale;
        const ys = (y - py) / scale;

        const newScale = clampScale([ww, wh], dimensions, scale * SCALE_FACTOR);
        return {
          scale: newScale,
          pan: [x - xs * newScale, y - ys * newScale],
        };
      }
    );
  },
};

export const zoomOut: Control = {
  title: "Zoom (scroll)  out",
  shortcut: "-",
  detail: "Zoom out on the sample",
  action: (update) => {
    update(
      ({
        scale,
        windowBBox: [_, __, ww, wh],
        config: { dimensions },
        pan: [px, py],
      }) => {
        const x = ww / 2;
        const y = wh / 2;

        const xs = (x - px) / scale;
        const ys = (y - py) / scale;

        const newScale = clampScale([ww, wh], dimensions, scale / SCALE_FACTOR);
        return {
          scale: newScale,
          pan: [x - xs * newScale, y - ys * newScale],
        };
      }
    );
  },
};

export const zoomToContent: Control = {
  title: "Zoom to content",
  shortcut: "z",
  detail: "Zoom in on visible labels",
  action: (update) => {
    update(({ disableOverlays }) => ({ zoomToContent: !disableOverlays }));
  },
};

export const resetZoom: Control = {
  title: "Reset zoom",
  shortcut: "r",
  detail: "Reset zoom to default",
  action: (update) => {
    update({ setZoom: true });
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
  action: (update, dispatchEvent) => {
    update(
      ({ config: { thumbnail }, options: { fullscreen } }) =>
        thumbnail ? {} : { options: { fullscreen: !fullscreen } },
      ({ config: { thumbnail }, options: { fullscreen } }) => {
        if (!thumbnail) {
          dispatchEvent("fullscreen", fullscreen);
        }
      }
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
  zoomToContent,
  resetZoom,
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
        const total = getFrameNumber(duration, duration, frameRate);
        let old = frameNumber;

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
  action: (update) => {
    update(({ playing, config: { thumbnail } }) => {
      return thumbnail
        ? {}
        : {
            playing: !playing,
          };
    });
  },
};

export const muteUnmute: Control<VideoState> = {
  title: "Mute / unmute",
  shortcut: "m",
  detail: "Mute or unmute the video",
  action: (update) => {
    update(({ options: { volume }, config: { thumbnail } }) => {
      return thumbnail
        ? {}
        : {
            options: { volume: volume === 0 ? 0.5 : 0 },
          };
    });
  },
};

export const resetPlaybackRate: Control<VideoState> = {
  title: "Reset playback rate",
  shortcut: "p",
  detail: "Reset the video's playback rate",
  action: (update) => {
    update(({ config: { thumbnail } }) => {
      return thumbnail
        ? {}
        : {
            options: { playbackRate: 1 },
          };
    });
  },
};

export const VIDEO = {
  muteUnmute,
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
    header.innerText = "Actions and shortcuts";
    header.classList.add(lookerHelpPanelHeader);
    element.appendChild(header);
    element.classList.add(lookerHelpPanel);

    const container = document.createElement("div");
    container.classList.add(lookerHelpPanelContainer);

    const vContainer = document.createElement("div");
    vContainer.classList.add(lookerHelpPanelVerticalContainer);

    vContainer.appendChild(element);

    container.appendChild(vContainer);

    const items = document.createElement("div");
    items.classList.add(lookerHelpPanelItems);
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
  item.classList.add(lookerShortcutItem);

  const shortcut = document.createElement("div");
  shortcut.classList.add(lookerShortcutValue);
  shortcut.innerHTML = value.shortcut;

  const title = document.createElement("div");
  title.classList.add(lookerShortcutTitle);
  title.innerText = value.title;

  const detail = document.createElement("div");
  detail.classList.add(lookerShortcutDetail);
  detail.innerText = value.detail;

  item.appendChild(shortcut);
  item.appendChild(title);
  item.appendChild(detail);

  items.appendChild(item);
};
