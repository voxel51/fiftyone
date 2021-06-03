/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState, Coordinates } from "../state";
import { clampScale, elementBBox, getPixelCoordinates, snapBox } from "../util";
import { BaseElement, Events } from "./base";
import { ICONS, makeCheckboxRow, makeWrapper } from "./util";

export class LookerElement<State extends BaseState> extends BaseElement<
  State,
  HTMLDivElement
> {
  private hideControlsTimeout?: ReturnType<typeof setTimeout>;
  private start: Coordinates = [0, 0];
  private wheelTimeout: ReturnType<typeof setTimeout>;

  getEvents(): Events<State> {
    return {
      keydown: ({ event, update, dispatchEvent }) => {
        const e = event as KeyboardEvent;
        switch (e.key) {
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
          case "s":
            update((state) => ({
              showOptions: state.showOptions,
              showControls: state.showControls,
            }));
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
      mousedown: ({ event, update }) => {
        update(({ config: { thumbnail }, pan: [x, y] }) => {
          if (thumbnail) {
            return {};
          }
          event.preventDefault();
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
            pan: this.getPan([event.pageX, event.pageY], state),
          };
        });
      },
      mousemove: ({ event, update }) => {
        if (this.hideControlsTimeout) {
          clearTimeout(this.hideControlsTimeout);
        }
        this.hideControlsTimeout = setTimeout(
          () =>
            update(({ showOptions }) => {
              if (showOptions) {
                return { showControls: false };
              }
              return {};
            }),
          2500
        );
        update((state) => {
          if (state.config.thumbnail || !state.panning) {
            return state.rotate !== 0 ? { rotate: 0 } : {};
          }
          return {
            rotate: 0,
            pan: this.getPan([event.pageX, event.pageY], state),
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
          ({ config: { thumbnail, dimensions }, pan: [px, py], scale }) => {
            if (thumbnail) {
              return {};
            }
            event.preventDefault();
            const [tlx, tly, width, height] = elementBBox(this.element);

            const x = event.x - tlx;
            const y = event.y - tly;

            const xs = (x - px) / scale;
            const ys = (y - py) / scale;
            const newScale = clampScale(
              [width, height],
              dimensions,
              event.deltaY < 0 ? scale * 1.15 : scale / 1.15
            );

            if (scale === newScale) {
              return {};
            }

            if (this.wheelTimeout) {
              clearTimeout(this.wheelTimeout);
            }

            this.wheelTimeout = setTimeout(() => {
              this.wheelTimeout = null;
              update({ scale: newScale });
            }, 200);

            return {
              pan: snapBox(
                newScale,
                [x - xs * newScale, y - ys * newScale],
                [width, height],
                dimensions
              ),
              scale: newScale,
              canZoom: false,
              cursorCoordinates: [
                (<MouseEvent>event).pageX,
                (<MouseEvent>event).pageY,
              ],
            };
          },
          dispatchTooltipEvent(dispatchEvent)
        );
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "looker loading";
    element.tabIndex = -1;
    return element;
  }

  renderSelf({ loaded, hovering, config: { thumbnail } }) {
    if (loaded && this.element.classList.contains("loading")) {
      this.element.classList.remove("loading");
    }
    if (!thumbnail && hovering && this.element !== document.activeElement) {
      this.element.focus();
    }
    return this.element;
  }

  private getPan(
    [x, y]: Coordinates,
    { scale, config: { dimensions } }: Readonly<State>
  ): Coordinates {
    const [sx, sy] = this.start;
    const { width, height } = this.element.getBoundingClientRect();
    return snapBox(scale, [x - sx, y - sy], [width, height], dimensions);
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
      wheel: ({ event }) => {
        event.stopPropagation();
      },
      dblclick: ({ event }) => {
        event.stopPropagation();
      },
      mousedown: ({ event }) => {
        event.stopPropagation();
      },
      mouseup: ({ event }) => {
        event.stopPropagation();
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
    if (this.showControls === (showControls && !disableControls)) {
      this.element;
    }
    if (showControls && !disableControls) {
      this.element.style.opacity = "0.9";
      this.element.style.height = "unset";
    } else {
      this.element.style.opacity = "0.0";
      this.element.style.height = "0";
    }
    this.showControls = showControls && !disableControls;
    return this.element;
  }
}

export class OptionsButtonElement<State extends BaseState> extends BaseElement<
  State
> {
  private showControls: boolean;

  getEvents(): Events<State> {
    return {
      click: ({ event, update }) => {
        event.stopPropagation();
        update((state) => ({ showOptions: !state.showOptions }));
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("img");
    element.className = "looker-clickable";
    element.src = ICONS.options;
    element.title = "Settings (s)";
    element.style.gridArea = "2 / 5 / 2 / 5";
    return element;
  }

  renderSelf({ showControls, disableControls }) {
    if (this.showControls === (showControls && !disableControls)) {
      this.element;
    }
    if (showControls && !disableControls) {
      this.element.style.opacity = "0.9";
      this.element.style.height = "unset";
    } else {
      this.element.style.opacity = "0.0";
      this.element.style.height = "0";
    }
    this.showControls = showControls && !disableControls;
    return this.element;
  }
}

export class OptionsPanelElement<State extends BaseState> extends BaseElement<
  State
> {
  getEvents(): Events<State> {
    return {
      click: ({ event }) => {
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

  renderSelf({ showOptions, disableControls }) {
    if (this.showOptions === (showOptions && !disableControls)) {
      this.element;
    }
    if (showOptions && !disableControls) {
      this.element.style.opacity = "0.9";
      this.element.classList.remove("looker-display-none");
    } else {
      this.element.style.opacity = "0.0";
      this.element.classList.add("looker-display-none");
    }
    this.showOptions = showOptions && !disableControls;
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

export class WindowElement<State extends BaseState> extends BaseElement<State> {
  getEvents(): Events<State> {
    return {
      click: ({ update, dispatchEvent }) => {
        update({ showOptions: false }, (svg, state, overlays) => {
          if (!state.config.thumbnail && overlays.length) {
            dispatchEvent(
              "select",
              overlays[0].getSelectData(
                state,
                getPixelCoordinates(
                  state.cursorCoordinates,
                  state.config.dimensions,
                  elementBBox(svg.node)
                )
              )
            );
          }
        });
      },
      mouseleave: ({ update, dispatchEvent }) => {
        update({
          cursorCoordinates: null,
          disableControls: false,
        });
        dispatchEvent("tooltip", null);
      },
      mousemove: ({ event, update, dispatchEvent }) => {
        update((state) => {
          return state.config.thumbnail
            ? {}
            : {
                redraw: false,
                cursorCoordinates: [
                  (<MouseEvent>event).pageX,
                  (<MouseEvent>event).pageY,
                ],
              };
        }, dispatchTooltipEvent(dispatchEvent));
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "looker-window";
    return element;
  }

  renderSelf({ panning, pan: [x, y], scale, config: { thumbnail } }) {
    if (panning && this.element.style.cursor !== "all-scroll") {
      this.element.style.cursor = "all-scroll";
    } else if (
      !thumbnail &&
      !panning &&
      this.element.style.cursor !== "default"
    ) {
      this.element.style.cursor = "default";
    }
    this.element.style.transform =
      "translate3d(" +
      Math.round(x) +
      "px, " +
      Math.round(y) +
      "px, 0px) scale(" +
      scale +
      ")";

    return this.element;
  }
}

const dispatchTooltipEvent = (dispatchEvent) => {
  return (svg, state, overlays) => {
    // @ts-ignore
    if (state.playing && state.config.thumbnail) {
      return;
    }
    if (!state.options.showTooltip) {
      return;
    }
    let detail =
      overlays.length &&
      overlays[0].containsPoint(
        state,
        getPixelCoordinates(
          state.cursorCoordinates,
          state.config.dimensions,
          elementBBox(svg.node)
        )
      )
        ? overlays[0].getPointInfo(
            state,
            getPixelCoordinates(
              state.cursorCoordinates,
              state.config.dimensions,
              elementBBox(svg.node)
            )
          )
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
