/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState, Coordinates } from "../state";
import { BaseElement, Events } from "./base";
import { ICONS, makeCheckboxRow, makeWrapper } from "./util";

export class LookerElement<State extends BaseState> extends BaseElement<State> {
  private hideControlsTimeout?: ReturnType<typeof setTimeout>;

  events: Events<State> = {
    blur: ({ update }) => {
      update({ showOptions: false, showControls: false, focused: false });
    },
    focus: ({ update }) => {
      update({ focused: true });
    },
    keydown: ({ event, update }) => {
      // esc: hide settings
      const e = event as KeyboardEvent;
      if (e.keyCode === 27) {
        update({ showControls: false, showOptions: false });
      }
      // s: toggle settings
      else if (event.key === "s") {
        update((state) => ({
          showOptions: state.showOptions,
          showControls: state.showControls,
        }));
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

  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "p51";
    element.tabIndex = 0;
    return element;
  }

  renderSelf() {
    return this.element;
  }
}

export class CanvasElement<State extends BaseState> extends BaseElement<State> {
  events: Events<State> = {
    click: ({ update }) => {
      update({ showOptions: false });
    },
    mouseenter: ({ update }) => {},
    mouseleave: ({ update }) => {
      update({
        tooltipOverlay: null,
        cursorCoordinates: null,
        disableControls: false,
      });
    },
    mousemove: ({ event, update }) => {
      update({
        cursorCoordinates: [
          (<MouseEvent>event).clientX,
          (<MouseEvent>event).clientY,
        ],
      });
    },
  };

  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "p51-canvas";
    const canvas = document.createElement("canvas");
    canvas.className = "p51-canvas";
    element.appendChild(canvas);
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
  events: Events<State> = {
    click: ({ update }) => {
      update({
        showControls: false,
        disableControls: true,
        showOptions: false,
      });
    },
    mouseenter: ({ update }) => {
      update({ tooltipOverlay: null, hoveringControls: true });
    },
    mouseleave: ({ update }) => {
      update({ hoveringControls: false });
    },
  };

  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "p51-controls";
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

  events: Events<State> = {
    click: ({ event, update }) => {
      event.stopPropagation();
      update((state) => ({ showOptions: !state.showOptions }));
    },
  };

  createHTMLElement() {
    const element = document.createElement("img");
    element.className = "p51-clickable";
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

  events: Events<State> = {
    mouseenter: ({ update }) => {
      update({ tooltipOverlay: null, hoveringControls: true });
    },
    mouseleave: ({ update }) => {
      update({ hoveringControls: false });
    },
  };

  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "p51-options-panel";
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
      this.element.classList.remove("p51-display-none");
    } else {
      this.element.style.opacity = "0.0";
      this.element.classList.add("p51-display-none");
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

  events: Events<State> = {
    change: ({ update }) => {
      update({ options: { showConfidence: this.checkbox.checked } });
    },
  };

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

  events: Events<State> = {
    change: ({ update }) => {
      update({ options: { showTooltip: this.checkbox.checked } });
    },
  };

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
  private window: HTMLDivElement;
  private start: Coordinates = [0, 0];

  events: Events<State> = {
    dragstart: ({ event, update }) => {
      event.preventDefault();
      update(({ pan: [x, y] }) => {
        this.start = [event.clientX - x, event.clientY - y];
        return {};
      });
    },
    drag: ({ event, update }) => {
      event.preventDefault();
      const [x, y] = this.start;
      update({ pan: [event.clientX - x, event.clientY - y] });
    },
    wheel: ({ event, update }) => {
      event.preventDefault();
      update(({ pan: [x, y], scale }) => {
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

  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "p51-window-container";
    const child = document.createElement("div");
    child.className = "p51-window";
    element.appendChild(child);
    this.eventTarget = child;
    return element;
  }

  renderSelf({ pan: [x, y], scale }) {
    this.window.style.transform =
      "translate(" + x + "px, " + y + "px) scale(" + scale + ")";
    return this.element;
  }
}
