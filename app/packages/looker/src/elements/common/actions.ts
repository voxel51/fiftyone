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
  dispatchEvent: DispatchEvent,
  eventKey?: string
) => void;

interface Control<State extends BaseState = BaseState> {
  eventKeys?: string | string[];
  title: string;
  shortcut: string;
  detail: string;
  action: Action<State>;
}

interface ControlMap<State extends BaseState> {
  [key: string]: Control<State>;
}

const readActions = <State extends BaseState>(
  actions: ControlMap<State>
): ControlMap<State> => {
  return Object.fromEntries(
    Object.entries(actions).reduce((acc, [_, v]) => {
      if (Array.isArray(v.eventKeys)) {
        return [...acc, ...v.eventKeys.map((key) => [key, v])];
      }

      return [...acc, [v.eventKeys || v.shortcut, v]];
    }, [])
  );
};

const escape: Control = {
  title: "Escape window",
  shortcut: "Esc",
  detail: "Escape help -> settings -> zoom -> fullscreen -> close",
  action: (update, dispatchEvent, eventKey) => {
    update(
      ({
        hasDefaultZoom,
        showHelp,
        showOptions,
        options: { fullscreen: fullscreenSetting },
      }) => {
        if (showHelp) {
          return { showHelp: false };
        }

        if (showOptions) {
          return { showOptions: false };
        }

        if (!hasDefaultZoom) {
          return {
            setZoom: true,
          };
        }

        if (fullscreenSetting) {
          fullscreen.action(update, dispatchEvent, eventKey);
          return {};
        }

        dispatchEvent("close");
        return {};
      }
    );
  },
};

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
  eventKeys: "ArrowRight",
  detail: "Go to the next sample",
  action: (_, dispatchEvent) => {
    dispatchEvent("next");
  },
};

export const previous: Control = {
  title: "Previous sample",
  shortcut: "&#8592;",
  eventKeys: "ArrowLeft",
  detail: "Go to the previous sample",
  action: (_, dispatchEvent) => {
    dispatchEvent("previous");
  },
};

export const rotatePrevious: Control = {
  title: "Rotate label forward",
  shortcut: "&#8595;",
  eventKeys: "ArrowUp",
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
  eventKeys: "ArrowDown",
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
  eventKeys: ["/", "?"],
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
  eventKeys: ["+", "="],
  shortcut: "+",
  detail: "Zoom in on the sample",
  action: (update) => {
    update(
      ({
        scale,
        windowBBox: [_, __, ww, wh],
        config: { dimensions },
        pan: [px, py],
        options: { zoomPad },
      }) => {
        const x = ww / 2;
        const y = wh / 2;

        const xs = (x - px) / scale;
        const ys = (y - py) / scale;

        const newScale = clampScale(
          [ww, wh],
          dimensions,
          scale * SCALE_FACTOR,
          zoomPad
        );
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
  eventKeys: ["-", "_"],
  shortcut: "-",
  detail: "Zoom out on the sample",
  action: (update) => {
    update(
      ({
        scale,
        windowBBox: [_, __, ww, wh],
        config: { dimensions },
        pan: [px, py],
        options: { zoomPad },
      }) => {
        const x = ww / 2;
        const y = wh / 2;

        const xs = (x - px) / scale;
        const ys = (y - py) / scale;

        const newScale = clampScale(
          [ww, wh],
          dimensions,
          scale / SCALE_FACTOR,
          zoomPad
        );
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
  detail: "Toggle the settings panel",
  action: (update) => {
    update(({ showOptions, config: { thumbnail } }) => {
      if (thumbnail) {
        return {};
      } else if (showOptions) {
        return {
          showOptions: false,
          disableControls: false,
        };
      } else {
        return {
          disableControls: false,
          showControls: true,
          showOptions: true,
        };
      }
    });
  },
};

export const controlsToggle: Control = {
  title: "Controls",
  shortcut: "c",
  detail: "Toggle controls",
  action: (update) => {
    update(({ config: { thumbnail }, showControls }) => {
      if (thumbnail) {
        return {};
      } else if (showControls) {
        return {
          showControls: false,
          disableControls: false,
        };
      } else {
        return {
          disableControls: false,
          showControls: true,
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
  escape,
  next,
  previous,
  rotateNext,
  rotatePrevious,
  help,
  zoomIn,
  zoomOut,
  zoomToContent,
  resetZoom,
  controlsToggle,
  settings,
  fullscreen,
};

export const COMMON_SHORTCUTS = readActions(COMMON);

export const nextFrame: Control<VideoState> = {
  title: "Next frame",
  eventKeys: [".", ">"],
  shortcut: ">",
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

        return { frameNumber: Math.max(total, frameNumber + 1) };
      }
    );
  },
};

export const previousFrame: Control<VideoState> = {
  title: "Previous frame",
  eventKeys: [",", "<"],
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
  eventKeys: " ",
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

const seekTo: Control<VideoState> = {
  title: "Seek to",
  detail: "Seek to 0%, 10%, 20%... of the video",
  shortcut: "0-9",
  eventKeys: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  action: (update, _, eventKey) => {
    update(({ duration, config: { frameRate } }) => {
      const total = getFrameNumber(duration, duration, frameRate);
      return {
        frameNumber: (parseInt(eventKey, 10) / 10) * total,
      };
    });
  },
};

export const VIDEO = {
  muteUnmute,
  playPause,
  nextFrame,
  previousFrame,
  seekTo,
};

export const VIDEO_SHORTCUTS = readActions(VIDEO);

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
    header.innerText = "Help";
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
