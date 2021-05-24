/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState, Coordinates } from "../state";
import { getCanvasCoordinates } from "../util";
import { BaseElement, Events } from "./base";
import { ICONS, makeCheckboxRow, makeWrapper } from "./util";

export class LookerElement<State extends BaseState> extends BaseElement<
  State,
  HTMLDivElement
> {
  private hideControlsTimeout?: ReturnType<typeof setTimeout>;

  getEvents(): Events<State> {
    return {
      blur: ({ update }) => {
        update({ showOptions: false, showControls: false, focused: false });
      },
      focus: ({ update }) => {
        update({ focused: true });
      },
      keydown: ({ event, update }) => {
        // esc: hide settings
        const e = event as KeyboardEvent;
        switch (e.key) {
          case "ArrowDown":
            update(({ rotate }) => ({ rotate: rotate - 1 }));
            return;
          case "ArrowUp":
            update(({ rotate }) => ({ rotate: Math.min(rotate + 1, 0) }));
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
          return {
            hovering: true,
            showControls: thumbnail,
          };
        });
        this.hideControlsTimeout = setTimeout(() =>
          update({ showControls: false, showOptions: false })
        );
      },
      mousemove: ({ update }) => {
        if (this.hideControlsTimeout) {
          clearTimeout(this.hideControlsTimeout);
          this.hideControlsTimeout = null;
        }
        update({ rotate: 0 });
      },
      mouseleave: ({ update, dispatchEvent }) => {
        dispatchEvent("mouseleave");
        update({
          hovering: false,
          disableControls: false,
          showControls: false,
          showOptions: false,
        });
        if (this.hideControlsTimeout) {
          clearTimeout(this.hideControlsTimeout);
          this.hideControlsTimeout = null;
        }
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "looker loading";
    element.tabIndex = -1;
    return element;
  }

  renderSelf({ loaded }) {
    if (loaded && this.element.classList.contains("loading")) {
      this.element.classList.remove("loading");
    }
    return this.element;
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
          if (overlays.length) {
            dispatchEvent(
              "select",
              overlays[0].getSelectData(
                context,
                state,
                getCanvasCoordinates(
                  state.cursorCoordinates,
                  state.pan,
                  state.scale,
                  context.canvas
                )
              )
            );
          }
        });
      },
      mouseleave: ({ update }) => {
        update({
          cursorCoordinates: null,
          disableControls: false,
        });
      },
      mousemove: ({ event, update, dispatchEvent }) => {
        update(
          {
            cursorCoordinates: [
              (<MouseEvent>event).clientX,
              (<MouseEvent>event).clientY,
            ],
          },
          (context, state, overlays) => {
            if (overlays.length) {
              dispatchEvent(
                "tooltip",
                overlays[0].getPointInfo(
                  context,
                  state,
                  getCanvasCoordinates(
                    state.cursorCoordinates,
                    state.pan,
                    state.scale,
                    context.canvas
                  )
                )
              );
            }
          }
        );
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("canvas");
    element.className = "looker-canvas";
    return element;
  }

  renderSelf({ config: { dimensions } }) {
    if (this.element.width !== 1280) {
      const aspectRatio = dimensions[0] / dimensions[1];
      this.element.width = 1280;
      this.element.height = 1280 / aspectRatio;
    }
    return this.element;
  }
}

export class ControlsElement<State extends BaseState> extends BaseElement<
  State
> {
  private showControls: boolean;

  getEvents(): Events<State> {
    return {
      click: ({ update }) => {
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
      change: ({ update }) => {
        update({ options: { showConfidence: this.checkbox.checked } });
      },
    };
  }

  createHTMLElement() {
    this.eventTarget = this.checkbox;
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
      change: ({ update }) => {
        update({ options: { showTooltip: this.checkbox.checked } });
      },
    };
  }

  createHTMLElement() {
    this.eventTarget = this.checkbox;
    [this.label, this.checkbox] = makeCheckboxRow("Show tooltip", false);
    return makeWrapper([this.label]);
  }

  renderSelf({ options: { showTooltip } }) {
    this.checkbox.checked = showTooltip;
    return this.element;
  }
}

export class WindowElement<State extends BaseState> extends BaseElement<State> {
  private start: Coordinates = [0, 0];

  getEvents(): Events<State> {
    return {
      dragstart: ({ event, update }) => {
        update(({ config: { thumbnail }, pan: [x, y] }) => {
          if (thumbnail) {
            return {};
          }
          event.preventDefault();
          this.start = [event.clientX - x, event.clientY - y];
          return {};
        });
      },
      drag: ({ event, update }) => {
        event.preventDefault();
        const [x, y] = this.start;
        update(({ config: { thumbnail } }) => {
          if (thumbnail) {
            return {};
          }
          return { pan: [event.clientX - x, event.clientY - y] };
        });
      },
      wheel: ({ event, update }) => {
        update(({ config: { thumbnail }, pan: [x, y], scale }) => {
          if (thumbnail) {
            return {};
          }
          event.preventDefault();
          const xs = (event.clientX - x) / scale,
            ys = (event.clientY - y) / scale,
            delta = -event.deltaY;

          delta > 0 ? (scale *= 1.2) : (scale /= 1.2);

          return {
            pan: [event.clientX - xs * scale, event.clientY - ys * scale],
            scale,
          };
        });
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "looker-window";
    return element;
  }

  renderSelf({ pan: [x, y], scale }) {
    this.element.style.transform =
      "translate(" + x + "px, " + y + "px) scale(" + scale + ")";
    return this.element;
  }
}
