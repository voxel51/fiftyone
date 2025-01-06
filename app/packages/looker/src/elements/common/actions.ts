/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { dispatchTimelineSetFrameNumberEvent } from "@fiftyone/playback";
import { SCALE_FACTOR } from "../../constants";
import { ImaVidFramesController } from "../../lookers/imavid/controller";
import {
  BaseState,
  Control,
  ControlEventKeyType,
  ControlMap,
  ImaVidConfig,
  ImaVidState,
  VideoState,
} from "../../state";
import { clampScale } from "../../util";
import { getFrameNumber } from "../util";

import { dispatchTooltipEvent } from "./util";

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
  title: "Escape context",
  shortcut: "Esc",
  eventKeys: "Escape",
  detail: "Escape the current context",
  alwaysHandle: true,
  action: (update, dispatchEvent, eventKey) => {
    update(
      ({
        hasDefaultZoom,
        showOptions,
        options: { showJSON, showHelp, selectedLabels },
      }) => {
        if (showHelp) {
          dispatchEvent("panels", { showHelp: "close" });
          return {};
          // return { options: {showHelp: false} };
        }

        if (showOptions) {
          return { showOptions: false };
        }

        if (showJSON) {
          dispatchEvent("panels", { showJSON: "close" });
          return { options: { showJSON: false } };
        }

        if (!hasDefaultZoom) {
          return {
            setZoom: true,
          };
        }

        if (selectedLabels.length) {
          dispatchEvent("clear");
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
  action: (update, dispatchEvent) => {
    update(({ config: { thumbnail }, options: { showControls } }) => {
      if (thumbnail) {
        return {};
      }

      dispatchEvent("options", { showControls: !showControls });

      return {
        disableControls: showControls,
        showOptions: false,
      };
    });
  },
};

export const wheel: Control = {
  title: "Zoom",
  shortcut: "Wheel",
  eventKeys: null,
  detail: "Zoom in and out",
  action: () => null,
};

export const toggleOverlays: Control = {
  title: "Show/hide overlays",
  shortcut: "shift",
  eventKeys: "Shift",
  eventKeyType: ControlEventKeyType.HOLD,
  detail: "Toggles visibility of all overlays",
  action: (update, dispatchEvent) => {
    update(
      ({ config: { thumbnail } }) =>
        thumbnail ? {} : { options: { showOverlays: false } },
      ({ config: { thumbnail }, options: { showOverlays } }) => {
        if (!thumbnail) {
          dispatchEvent("showOverlays", false);
          dispatchEvent("tooltip", null);
        }
      }
    );
  },
  afterAction: (update, dispatchEvent) => {
    update(
      ({ config: { thumbnail } }) =>
        thumbnail ? {} : { options: { showOverlays: true } },
      ({ config: { thumbnail }, options: { showOverlays } }) => {
        if (!thumbnail) {
          dispatchEvent("showOverlays", true);
        }
      }
    );
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
  action: (update, dispatchEvent) => {
    update(({ showHelp, SHORTCUTS, config: { thumbnail } }) => {
      if (thumbnail) {
        return {};
      }

      dispatchEvent("panels", {
        showHelp: "toggle",
        SHORTCUTS,
      });

      return {};
    });
  },
};

export const zoomIn: Control = {
  title: "Zoom in",
  eventKeys: ["+", "="],
  shortcut: "+",
  detail: "Zoom in on the sample",
  action: (update) => {
    update(
      ({
        scale,
        windowBBox: [_, __, ww, wh],
        dimensions,
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
  title: "Zoom  out",
  eventKeys: ["-", "_"],
  shortcut: "-",
  detail: "Zoom out on the sample",
  action: (update) => {
    update(
      ({
        scale,
        windowBBox: [_, __, ww, wh],
        dimensions,
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

export const cropToContent: Control = {
  title: "Crop to content",
  shortcut: "z",
  detail: "Crop on visible labels",
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
  title: "Preferences",
  shortcut: "p",
  detail: "Toggle the preferences panel",
  action: (update, dispatchEvent) => {
    update(
      ({ showOptions, config: { thumbnail }, options: { showControls } }) => {
        if (thumbnail) {
          return {};
        } else if (showOptions) {
          return {
            showOptions: false,
            disableControls: false,
          };
        } else {
          !showControls && dispatchEvent("options", { showControls: true });
          return {
            disableControls: false,
            showOptions: true,
          };
        }
      }
    );
  },
};

export const controlsToggle: Control = {
  title: "Controls",
  shortcut: "c",
  detail: "Toggle controls",
  action: (update, dispatchEvent) => {
    update(({ config: { thumbnail }, options: { showControls } }) => {
      if (thumbnail) {
        return {};
      } else if (showControls) {
        dispatchEvent("options", { showControls: false });
        return {
          disableControls: false,
        };
      } else {
        dispatchEvent("options", { showControls: true });
        return {
          disableControls: false,
        };
      }
    });
  },
};

export const json: Control = {
  title: "JSON",
  shortcut: "j",
  detail: "View JSON",
  action: (update, dispatchEvent) => {
    dispatchEvent("panels", { showJSON: "toggle" });
  },
};

export const selectSample: Control = {
  title: "Select or Deselect Sample",
  shortcut: "x",
  eventKeys: null,
  detail: "Grid → Control + Click",
  action: () => null,
};

export const COMMON = {
  escape,
  rotateNext,
  rotatePrevious,
  help,
  zoomIn,
  zoomOut,
  cropToContent,
  resetZoom,
  controlsToggle,
  settings,
  json,
  wheel,
  toggleOverlays,
  selectSample,
};

export const COMMON_SHORTCUTS = readActions(COMMON);

export const nextFrame: Control<VideoState> = {
  title: "Next frame",
  eventKeys: [".", ">"],
  shortcut: ">",
  detail: "Seek to the next frame",
  alwaysHandle: true,
  action: (update, dispatchEvent) => {
    update(
      (state: VideoState) => {
        if (state.playing || state.config.thumbnail) {
          return {};
        }

        const {
          lockedToSupport,
          duration,
          frameNumber,
          config: { frameRate, support },
        } = state as VideoState;

        const end = lockedToSupport
          ? support[1]
          : getFrameNumber(duration, duration, frameRate);

        return {
          frameNumber: Math.min(end, frameNumber + 1),
        };
      },
      (state, overlays) => dispatchTooltipEvent(dispatchEvent)(state, overlays)
    );
  },
};

export const nextFrameNoOpControl: Control<ImaVidState> = {
  title: "Next frame",
  eventKeys: [".", ">"],
  shortcut: ">",
  detail: "Seek to the next frame",
  alwaysHandle: true,
  action: () => {
    // no-op here, supposed to be implemented elsewhere
  },
};

export const previousFrame: Control<VideoState> = {
  title: "Previous frame",
  eventKeys: [",", "<"],
  shortcut: "<",
  detail: "Seek to the previous frame",
  alwaysHandle: true,
  action: (update, dispatchEvent) => {
    update(
      (state: VideoState) => {
        if (state.playing || state.config.thumbnail) {
          return {};
        }

        const {
          lockedToSupport,
          frameNumber,
          config: { support },
        } = state as VideoState;

        return {
          frameNumber: Math.max(
            lockedToSupport ? support[0] : 1,
            frameNumber - 1
          ),
        };
      },
      (state, overlays) => dispatchTooltipEvent(dispatchEvent)(state, overlays)
    );
  },
};

export const previousFrameNoOpControl: Control<ImaVidState> = {
  title: "Previous frame",
  eventKeys: [",", "<"],
  shortcut: "<",
  detail: "Seek to the previous frame",
  alwaysHandle: true,
  action: () => {
    // no-op here, supposed to be implemented elsewhere
  },
};

export const playPause: Control<VideoState> = {
  title: "Play / pause",
  shortcut: "Space",
  eventKeys: " ",
  detail: "Play or pause the video",
  action: (update, dispatchEvent) => {
    update((state: VideoState) => {
      if (state.config.thumbnail) {
        return {};
      }

      dispatchEvent("options", { showJSON: false });

      if ((state.config as ImaVidConfig).frameStoreController) {
        return {};
      }

      const {
        playing,
        duration,
        frameNumber,
        lockedToSupport,
        config: { support, frameRate },
      } = state as VideoState;
      const start = lockedToSupport ? support[0] : 1;
      const end = lockedToSupport
        ? support[1]
        : getFrameNumber(duration, duration, frameRate);
      const frame =
        end === frameNumber ? (lockedToSupport ? support[0] : 1) : frameNumber;
      return {
        playing: !playing && start !== end,
        frameNumber: frame,
        currentFrameNumber: frame,
        options: { showJSON: false },
      };
    });
  },
};

export const muteUnmute: Control<VideoState> = {
  title: "Mute / unmute",
  shortcut: "m",
  detail: "Mute or unmute the video",
  action: (update, dispatchEvent) => {
    update(({ options: { volume }, config: { thumbnail } }) => {
      if (thumbnail) {
        return {};
      }

      volume = volume === 0 ? 0.5 : 0;

      dispatchEvent("options", { volume });

      return {
        options: { volume },
      };
    });
  },
};

export const resetPlaybackRate: Control<VideoState> = {
  title: "Reset playback rate",
  shortcut: "p",
  detail: "Reset the video's playback rate",
  action: (update, dispatchEvent) => {
    update(({ config: { thumbnail } }) => {
      if (thumbnail) {
        return {};
      }

      dispatchEvent("options", { playbackRate: 1 });

      return {
        options: { playbackRate: 1 },
      };
    });
  },
};

const seekTo: Control<VideoState | ImaVidState> = {
  title: "Seek to",
  detail: "Seek to 0%, 10%, 20%... of the video",
  shortcut: "0-9",
  eventKeys: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  action: (update, dispatchEvent, eventKey) => {
    update((state: ImaVidState | VideoState) => {
      const isImavid = (state.config as ImaVidConfig)
        .frameStoreController as ImaVidFramesController;
      const frameName = isImavid ? "currentFrameNumber" : "frameNumber";
      let total = 0;
      let base = 0;
      if (isImavid) {
        const {
          config: {
            frameStoreController: { totalFrameCount },
          },
          currentFrameNumber,
        } = state as ImaVidState;
        total = totalFrameCount;
        base = currentFrameNumber < totalFrameCount ? currentFrameNumber : 1;
      } else {
        const {
          lockedToSupport,
          config: { support, frameRate },
          duration,
        } = state as VideoState;
        const frameCount = getFrameNumber(duration, duration, frameRate);
        total = lockedToSupport ? support[1] - support[0] : frameCount;
        base = lockedToSupport ? support[0] : 1;
      }
      const position = Math.round((parseInt(eventKey, 10) / 10) * total) + base;
      dispatchEvent("options", { showJSON: false });
      return {
        [frameName]: Math.min(total, Math.max(1, position)),
        options: { showJSON: false },
      };
    });
  },
};

export const supportLock: Control<VideoState> = {
  title: "Support lock",
  filter: (config) => Boolean(config.support),
  detail: "Toggle the lock on the support frame(s)",
  shortcut: "l",
  action: (update) => {
    update(({ lockedToSupport, config: { support }, frameNumber }) => {
      return {
        lockedToSupport: support ? !lockedToSupport : false,
        frameNumber:
          frameNumber < support[0] || frameNumber > support[1]
            ? support[0]
            : frameNumber,
      };
    });
  },
};

const videoEscape: Control<VideoState | ImaVidState> = {
  title: "Escape context",
  shortcut: "Esc",
  eventKeys: "Escape",
  detail: "Escape the current context",
  alwaysHandle: true,
  action: (update, dispatchEvent) => {
    update((state: ImaVidState | VideoState) => {
      const isImavid = (state.config as ImaVidConfig)
        .frameStoreController as ImaVidFramesController;

      const frameName = isImavid ? "currentFrameNumber" : "frameNumber";

      const {
        hasDefaultZoom,
        showOptions,
        config: { support },
        options: { showHelp, showJSON, selectedLabels },
        lockedToSupport,
      } = state as VideoState;

      if (showHelp) {
        dispatchEvent("panels", { showHelp: "close" });
        return { showHelp: "close" };
      }

      if (showOptions) {
        return { showOptions: false };
      }

      if (showJSON) {
        dispatchEvent("panels", { showJSON: "close" });
        dispatchEvent("options", { showJSON: false });
        return { options: { showJSON: false } };
      }

      if (!lockedToSupport && Boolean(support) && !isImavid) {
        return {
          frameNumber: support[0],
          lockedToSupport: true,
        };
      }

      if (!hasDefaultZoom) {
        return {
          setZoom: true,
        };
      }

      if (state[frameName] !== 1) {
        if (isImavid) {
          dispatchTimelineSetFrameNumberEvent({
            newFrameNumber: 1,
          });
        }

        return {
          [frameName]: 1,
          playing: false,
        };
      }

      if (selectedLabels.length) {
        dispatchEvent("clear");
        return {};
      }

      dispatchEvent("close");
      return {};
    });
  },
};

const VIDEO = {
  ...COMMON,
  escape: videoEscape,
  muteUnmute,
  playPause,
  nextFrame,
  previousFrame,
  seekTo,
  supportLock,
};

const IMAVID = {
  ...COMMON,
  escape: videoEscape,
  previousFrame: previousFrameNoOpControl,
  nextFrame: nextFrameNoOpControl,
};

export const VIDEO_SHORTCUTS = readActions(VIDEO);
export const IMAVID_SHORTCUTS = readActions(IMAVID);
