/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseElement, EventMap } from "./base";
import { ICONS, makeCheckboxRow, makeWrapper } from "./util";

export class PlayerBaseElement extends BaseElement {
  private hideControlsTimeout?: ReturnType<typeof setTimeout>;

  events = {
    blur: ({ update }) => {
      update({ showOptions: false, showControls: false, focused: false });
    },
    focus: ({ update }) => {
      update({ focused: true });
    },
    keydown: ({ event, update }) => {
      // esc: hide settings
      if (event.keyCode === 27) {
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

export class CanvasElement extends BaseElement {
  events: EventMap = {
    click: ({ update }) => {
      update({ showOptions: false });
    },
    mousenter: ({ update }) => {},
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

export class ControlsElement extends BaseElement {
  private showControls: boolean;
  events: EventMap = {
    click: ({ update }) => {
      update({
        showControls: false,
        disableControls: true,
        showOptions: false,
      });
    },
    mouseenter: ({ update }) => {
      update({ tooltipOverlay: null, hoveringControls: true, canFocus: false });
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

export class OptionsButtonElement extends BaseElement {
  private showControls: boolean;

  events = {
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

export class OptionsPanelElement extends BaseElement {
  private showOptions: boolean;

  events = {
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

export class OnlyShowHoveredOnLabelOptionElement extends BaseElement {
  checkbox: HTMLInputElement;
  label: HTMLLabelElement;

  createHTMLElement() {
    [this.label, this.checkbox] = makeCheckboxRow(
      "Only show hovered label",
      false
    );
    return makeWrapper([this.label]);
  }

  renderSelf({
    options: {
      overlay: { onlyShowHoveredLabel },
    },
  }) {
    this.checkbox.checked = onlyShowHoveredLabel;
    return this.element;
  }
}

export class ShowAttributesOptionElement extends BaseElement {
  checkbox: HTMLInputElement;
  label: HTMLLabelElement;

  createHTMLElement() {
    [this.label, this.checkbox] = makeCheckboxRow("Show attributes", false);
    return makeWrapper([this.label]);
  }

  renderSelf({
    options: {
      overlay: { showAttrs },
    },
  }) {
    this.checkbox.checked = showAttrs;
    return this.element;
  }
}

export class ShowConfidenceOptionElement extends BaseElement {
  checkbox: HTMLInputElement;
  label: HTMLLabelElement;

  events = {
    change: ({ update }) => {
      update({ showConfidence: this.checkbox.checked });
    },
  };

  createHTMLElement() {
    this.eventTarget = this.checkbox;
    [this.label, this.checkbox] = makeCheckboxRow("Show confidence", false);
    return makeWrapper([this.label]);
  }

  renderSelf({
    options: {
      overlay: { showConfidence },
    },
  }) {
    this.checkbox.checked = showConfidence;
    return this.element;
  }
}

export class ShowTooltipOptionElement extends BaseElement {
  checkbox: HTMLInputElement;
  label: HTMLLabelElement;

  events = {
    change: ({ update }) => {
      update({ showTooltip: this.checkbox.checked });
    },
  };

  createHTMLElement() {
    this.eventTarget = this.checkbox;
    [this.label, this.checkbox] = makeCheckboxRow("Show tooltip", false);
    return makeWrapper([this.label]);
  }

  renderSelf({
    options: {
      overlay: { showTooltip },
    },
  }) {
    this.checkbox.checked = showTooltip;
    return this.element;
  }
}
