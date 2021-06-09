/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { SCALE_FACTOR } from "../constants";
import { BaseState, Coordinates, Optional, StateUpdate } from "../state";
import { clampScale } from "../util";
import { BaseElement, DispatchEvent, Events } from "./base";
import { ICONS, makeCheckboxRow, makeWrapper } from "./util";

export class LookerElement<State extends BaseState> extends BaseElement<
  State,
  HTMLDivElement
> {
  getEvents(): Events<State> {
    return {
      keydown: ({ event, update, dispatchEvent }) => {
        const e = event as KeyboardEvent;
        switch (e.key) {
          case "-":
            zoomOut(update);
            return;
          case "+":
            zoomIn(update);
            return;
          case "ArrowDown":
            update(
              ({ rotate }) => ({ rotate: rotate + 1 }),
              dispatchTooltipEvent(dispatchEvent)
            );
            return;
          case "ArrowUp":
            update(
              ({ rotate }) => ({ rotate: Math.max(rotate - 1, 0) }),
              dispatchTooltipEvent(dispatchEvent)
            );
            return;
          case "Escape":
            update({ showControls: false, showOptions: false });
            return;
          case "m":
            toggleFullscreen(update);
            return;
          case "s":
            toggleOptions(update);
            return;
        }
      },
      mouseenter: ({ update, dispatchEvent }) => {
        dispatchEvent("mouseenter");
        update(({ config: { thumbnail } }) => {
          if (thumbnail) {
            return { hovering: true };
          }
          return {
            hovering: true,
            showControls: true,
          };
        });
      },
      mouseleave: ({ update, dispatchEvent }) => {
        dispatchEvent("mouseleave");
        update({
          hovering: false,
          disableControls: false,
          panning: false,
        });
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "looker loading";
    element.tabIndex = -1;
    return element;
  }

  renderSelf({ fullscreen, loaded, hovering, config: { thumbnail } }) {
    if (loaded && this.element.classList.contains("loading")) {
      this.element.classList.remove("loading");
    }
    if (!thumbnail && hovering && this.element !== document.activeElement) {
      this.element.focus();
    }

    const fullscreenClass = this.element.classList.contains("fullscreen");
    if (fullscreen && !fullscreenClass) {
      this.element.classList.add("fullscreen");
    } else if (!fullscreen && fullscreenClass) {
      this.element.classList.remove("fullscreen");
    }

    return this.element;
  }
}

export class CanvasElement<State extends BaseState> extends BaseElement<
  State,
  HTMLCanvasElement
> {
  private width: number;
  private height: number;
  private mousedownCoordinates: Coordinates;
  private hideControlsTimeout?: ReturnType<typeof setTimeout>;
  private start: Coordinates = [0, 0];
  private wheelTimeout: ReturnType<typeof setTimeout>;

  getEvents(): Events<State> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        update({ showOptions: false }, (state, overlays) => {
          if (state.config.thumbnail) {
            return;
          }
          const moved =
            event.pageX !== this.mousedownCoordinates[0] ||
            event.pageY !== this.mousedownCoordinates[1];
          if (!moved && overlays.length) {
            const top = overlays[0];
            top.containsPoint(state) &&
              dispatchEvent("select", top.getSelectData(state));
          }
        });
      },
      mouseleave: ({ dispatchEvent }) => {
        dispatchEvent("tooltip", null);
      },
      mousemove: ({ event, update, dispatchEvent }) => {
        if (this.hideControlsTimeout) {
          clearTimeout(this.hideControlsTimeout);
        }
        this.hideControlsTimeout = setTimeout(
          () =>
            update(({ showOptions, hoveringControls }) => {
              this.hideControlsTimeout = null;
              if (!showOptions && !hoveringControls) {
                return { showControls: false };
              }
              return {};
            }),
          2500
        );
        update((state) => {
          if (state.config.thumbnail) {
            return {};
          }
          const newState: Optional<State> = {
            cursorCoordinates: [
              (<MouseEvent>event).pageX,
              (<MouseEvent>event).pageY,
            ],
            rotate: 0,
            showControls: true,
          };
          if (!state.panning) {
            return newState;
          }
          newState.pan = this.getPan([event.pageX, event.pageY]);
          return newState;
        }, dispatchTooltipEvent(dispatchEvent));
      },
      mousedown: ({ event, update }) => {
        update(({ config: { thumbnail }, pan: [x, y] }) => {
          if (thumbnail) {
            return {};
          }
          event.preventDefault();
          this.mousedownCoordinates = [event.pageX - x, event.pageY];
          this.start = [event.pageX - x, event.pageY - y];
          return { panning: true, canZoom: false };
        });
      },
      mouseup: ({ event, update }) => {
        update((state) => {
          if (state.config.thumbnail || !state.panning) {
            return {};
          }
          event.preventDefault();
          return {
            panning: false,
            pan: this.getPan([event.pageX, event.pageY]),
          };
        });
      },
      dblclick: ({ update }) => {
        update(({ config: { thumbnail } }) => {
          return thumbnail ? {} : { scale: 1, pan: [0, 0], canZoom: true };
        });
      },
      wheel: ({ event, update, dispatchEvent }) => {
        update(
          ({
            config: { thumbnail, dimensions },
            pan: [px, py],
            scale,
            windowBBox: [tlx, tly, width, height],
          }) => {
            if (thumbnail) {
              return {};
            }
            event.preventDefault();

            const x = event.x - tlx;
            const y = event.y - tly;

            const xs = (x - px) / scale;
            const ys = (y - py) / scale;
            const newScale = clampScale(
              [width, height],
              dimensions,
              event.deltaY < 0 ? scale * SCALE_FACTOR : scale / SCALE_FACTOR
            );

            if (scale === newScale) {
              return {};
            }

            if (this.wheelTimeout) {
              clearTimeout(this.wheelTimeout);
            }

            this.wheelTimeout = setTimeout(() => {
              this.wheelTimeout = null;
              update({ wheeling: false });
            }, 200);

            return {
              pan: [x - xs * newScale, y - ys * newScale],
              scale: newScale,
              canZoom: false,
              cursorCoordinates: [
                (<MouseEvent>event).pageX,
                (<MouseEvent>event).pageY,
              ],
              wheeling: true,
            };
          },
          dispatchTooltipEvent(dispatchEvent)
        );
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("canvas");
    return element;
  }

  renderSelf({
    config: { thumbnail },
    panning,
    windowBBox: [_, __, width, height],
    mouseIsOnOverlay,
  }: Readonly<State>) {
    if (this.width !== width) {
      this.element.width = width;
    }
    if (this.height !== height) {
      this.element.height = height;
    }
    if (panning && this.element.style.cursor !== "all-scroll") {
      this.element.style.cursor = "all-scroll";
    } else if (!thumbnail && mouseIsOnOverlay) {
      this.element.style.cursor = "pointer";
    } else {
      this.element.style.cursor = "default";
    }
    return this.element;
  }

  private getPan([x, y]: Coordinates): Coordinates {
    const [sx, sy] = this.start;
    return [x - sx, y - sy];
  }
}

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
    element.src = ICONS.help;
    element.title = "Help (?)";
    element.style.gridArea = "2 / 9 / 2 / 9";
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
    element.style.gridArea = "2 / 8 / 2 / 8";
    return element;
  }

  renderSelf() {
    return this.element;
  }
}

export class OptionsPanelElement<State extends BaseState> extends BaseElement<
  State
> {
  private showOptions: boolean;
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
    element.className = "looker-options-panel";
    return element;
  }

  isShown({ config: { thumbnail } }) {
    return !thumbnail;
  }

  renderSelf({ showOptions, config: { thumbnail } }) {
    if (thumbnail) {
      return this.element;
    }
    if (this.showOptions === showOptions) {
      return this.element;
    }
    if (showOptions) {
      this.element.style.opacity = "0.9";
      this.element.classList.remove("looker-display-none");
    } else {
      this.element.style.opacity = "0.0";
      this.element.classList.add("looker-display-none");
    }
    this.showOptions = showOptions;
    return this.element;
  }
}

export class OnlyShowHoveredOnLabelOptionElement<
  State extends BaseState
> extends BaseElement<State> {
  checkbox: HTMLInputElement;
  label: HTMLLabelElement;

  getEvents(): Events<State> {
    return {
      click: ({ event, update }) => {
        event.stopPropagation();
        event.preventDefault();
        update(({ options: { onlyShowHoveredLabel } }) => ({
          options: { onlyShowHoveredLabel: !onlyShowHoveredLabel },
        }));
      },
    };
  }

  createHTMLElement() {
    [this.label, this.checkbox] = makeCheckboxRow(
      "Only show hovered label",
      false
    );
    return makeWrapper([this.label]);
  }

  renderSelf({ options: { onlyShowHoveredLabel } }) {
    this.checkbox.checked = onlyShowHoveredLabel;
    return this.element;
  }
}

export class ShowLabelOptionElement<
  State extends BaseState
> extends BaseElement<State> {
  checkbox: HTMLInputElement;
  label: HTMLLabelElement;

  getEvents(): Events<State> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        update(({ options: { showLabel } }) => {
          dispatchEvent("options", { showLabel: !showLabel });
          return {
            options: { showLabel: !showLabel },
          };
        });
      },
    };
  }

  createHTMLElement() {
    [this.label, this.checkbox] = makeCheckboxRow("Show label", false);
    return makeWrapper([this.label]);
  }

  renderSelf({ options: { showLabel } }) {
    this.checkbox.checked = showLabel;
    return this.element;
  }
}

export class ShowConfidenceOptionElement<
  State extends BaseState
> extends BaseElement<State> {
  checkbox: HTMLInputElement;
  label: HTMLLabelElement;

  getEvents(): Events<State> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        update(({ options: { showConfidence } }) => {
          dispatchEvent("options", { showConfidence: !showConfidence });
          return {
            options: { showConfidence: !showConfidence },
          };
        });
      },
    };
  }

  createHTMLElement() {
    [this.label, this.checkbox] = makeCheckboxRow("Show confidence", false);
    return makeWrapper([this.label]);
  }

  renderSelf({ options: { showConfidence } }) {
    this.checkbox.checked = showConfidence;
    return this.element;
  }
}

export class ShowTooltipOptionElement<
  State extends BaseState
> extends BaseElement<State> {
  checkbox: HTMLInputElement;
  label: HTMLLabelElement;

  getEvents(): Events<State> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        update(({ options: { showTooltip } }) => {
          dispatchEvent("options", { showTooltip: !showTooltip });
          return {
            options: { showTooltip: !showTooltip },
          };
        });
      },
    };
  }

  createHTMLElement() {
    [this.label, this.checkbox] = makeCheckboxRow("Show tooltip", false);
    return makeWrapper([this.label]);
  }

  renderSelf({ options: { showTooltip } }) {
    this.checkbox.checked = showTooltip;
    return this.element;
  }
}

export const transformWindowElement = (
  { pan: [x, y], scale }: Readonly<BaseState>,
  element: HTMLElement
): void => {
  element.style.transform =
    "translate3d(" +
    Math.round(x) +
    "px, " +
    Math.round(y) +
    "px, 0px) scale(" +
    scale +
    ")";
};

const dispatchTooltipEvent = (dispatchEvent) => {
  return (state, overlays) => {
    // @ts-ignore
    if (state.playing || state.config.thumbnail) {
      return;
    }
    if (!state.options.showTooltip) {
      return;
    }
    let detail =
      overlays.length && overlays[0].containsPoint(state)
        ? overlays[0].getPointInfo(state)
        : null;
    // @ts-ignore
    if (state.frameNumber && detail) {
      // @ts-ignore
      detail.frameNumber = state.frameNumber;
    }
    dispatchEvent(
      "tooltip",
      detail
        ? {
            ...detail,
            coordinates: state.cursorCoordinates,
          }
        : null
    );
  };
};

const zoomIn = (update: StateUpdate<BaseState>) => {
  update(({ scale, windowBBox: [_, __, ww, wh], config: { dimensions } }) => ({
    scale: clampScale([ww, wh], dimensions, scale * SCALE_FACTOR),
  }));
};

const zoomOut = (update: StateUpdate<BaseState>) => {
  update(({ scale, windowBBox: [_, __, ww, wh], config: { dimensions } }) => ({
    scale: clampScale([ww, wh], dimensions, scale / SCALE_FACTOR),
  }));
};

const toggleFullscreen = (update: StateUpdate<BaseState>) => {
  update(({ fullscreen, config: { thumbnail } }) =>
    thumbnail ? {} : { fullscreen: !fullscreen }
  );
};

const toggleOptions = (update: StateUpdate<BaseState>) => {
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
};

const next = (dispatchEvent: DispatchEvent) => {
  dispatchEvent("next");
};

const previous = (dispatchEvent: DispatchEvent) => {
  dispatchEvent("previous");
};
