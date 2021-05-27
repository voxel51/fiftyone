/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { CANVAS_WIDTH, MAX_SCALE } from "../constants";
import { BaseState, Coordinates } from "../state";
import { getCanvasCoordinates, getFitCanvasBBox } from "../util";
import { BaseElement, Events } from "./base";
import { ICONS, makeCheckboxRow, makeWrapper } from "./util";

export class LookerElement<State extends BaseState> extends BaseElement<
  State,
  HTMLDivElement
> {
  private hideControlsTimeout?: ReturnType<typeof setTimeout>;
  private start: Coordinates = [0, 0];

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
          this.start = [event.clientX - x, event.clientY - y];
          return { panning: true };
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
            pan: this.getPan([event.clientX, event.clientY], state),
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
            pan: this.getPan([event.clientX, event.clientY], state),
          };
        });
      },
      dblclick: ({ update }) => {
        update(({ config: { thumbnail } }) => {
          return thumbnail ? {} : { scale: 1, pan: [0, 0] };
        });
      },
      wheel: ({ event, update }) => {
        update(({ config: { thumbnail }, pan: [px, py], scale }) => {
          if (thumbnail) {
            return {};
          }
          event.preventDefault();
          let { x: tlx, y: tly } = this.element.getBoundingClientRect();

          const x = event.x - tlx;
          const y = event.y - tly;

          const xs = (x - px) / scale;
          const ys = (y - py) / scale;
          scale = Math.max(
            Math.min(event.deltaY < 0 ? scale * 1.2 : scale / 1.2, MAX_SCALE),
            1
          );

          return {
            pan: [x - xs * scale, y - ys * scale],
            scale,
            options: { zoom: false },
          };
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
    const [tlx, tly, w, h] = getFitCanvasBBox(dimensions, [
      0,
      0,
      width,
      height,
    ]);
    return [x - sx, y - sy];
  }
}

export class CanvasElement<State extends BaseState> extends BaseElement<
  State,
  HTMLCanvasElement
> {
  getEvents(): Events<State> {
    return {
      click: ({ update, dispatchEvent }) => {
        update({ showOptions: false }, (context, state, overlays) => {
          if (!state.config.thumbnail && overlays.length) {
            dispatchEvent(
              "select",
              overlays[0].getSelectData(
                context,
                state,
                getCanvasCoordinates(
                  state.cursorCoordinates,
                  state.config.dimensions,
                  context.canvas
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
                cursorCoordinates: [
                  (<MouseEvent>event).clientX,
                  (<MouseEvent>event).clientY,
                ],
              };
        }, dispatchTooltipEvent(dispatchEvent));
      },
    };
  }

  createHTMLElement({
    config: {
      dimensions: [w, h],
    },
  }) {
    const element = document.createElement("canvas");
    element.width = CANVAS_WIDTH;
    element.height = CANVAS_WIDTH / (w / h);
    element.className = "looker-canvas";
    return element;
  }

  renderSelf() {
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
  private showOptions: boolean;

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

export class ShowAttributesOptionElement<
  State extends BaseState
> extends BaseElement<State> {
  checkbox: HTMLInputElement;
  label: HTMLLabelElement;

  getEvents(): Events<State> {
    return {
      click: ({ event, update }) => {
        event.stopPropagation();
        update(({ options: { showAttrs } }) => ({
          options: { showAttrs: !showAttrs },
        }));
      },
    };
  }

  createHTMLElement() {
    [this.label, this.checkbox] = makeCheckboxRow("Show attributes", false);
    return makeWrapper([this.label]);
  }

  renderSelf({ options: { showAttrs } }) {
    this.checkbox.checked = showAttrs;
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
      click: ({ event, update }) => {
        event.stopPropagation();
        update(({ options: { showConfidence } }) => ({
          options: { showConfidence: !showConfidence },
        }));
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
      click: ({ event, update }) => {
        event.stopPropagation();
        update(({ options: { showTooltip } }) => ({
          options: { showTooltip: !showTooltip },
        }));
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
  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "looker-window";
    return element;
  }

  renderSelf({ panning, pan: [x, y], scale, config: { thumbnail } }) {
    if (panning && this.element.style.cursor !== "grab") {
      this.element.style.cursor = "grab";
    } else if (
      !thumbnail &&
      !panning &&
      this.element.style.cursor !== "default"
    ) {
      this.element.style.cursor = "default";
    }
    this.element.style.transform =
      "translate(" + x + "px, " + y + "px) scale(" + scale + ")";

    return this.element;
  }
}

const dispatchTooltipEvent = (dispatchEvent) => (context, state, overlays) => {
  // @ts-ignore
  if (state.playing && state.config.thumbnail) {
    return {};
  }
  let detail =
    overlays.length &&
    overlays[0].containsPoint(
      context,
      state,
      getCanvasCoordinates(
        state.cursorCoordinates,
        state.config.dimensions,
        context.canvas
      )
    )
      ? overlays[0].getPointInfo(
          context,
          state,
          getCanvasCoordinates(
            state.cursorCoordinates,
            state.config.dimensions,
            context.canvas
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
