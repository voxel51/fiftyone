/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { ICONS } from "./util";

const makeWrapper = function (children) {
  const wrapper = document.createElement("div");
  wrapper.className = "p51--opt-input";
  for (const child of children) {
    wrapper.appendChild(child);
  }
  return wrapper;
};

const makeCheckboxRow = function (
  text,
  checked
): [HTMLLabelElement, HTMLInputElement] {
  const label = document.createElement("label");
  label.className = "p51-label";
  label.innerHTML = text;

  const checkbox = document.createElement("input");
  checkbox.setAttribute("type", "checkbox");
  checkbox.checked = checked;
  const span = document.createElement("span");
  span.className = "p51-checkbox";
  label.appendChild(checkbox);
  label.appendChild(span);

  return [label, checkbox];
};

interface EventMap {
  [key: string]: (event: Event, update: (state: object) => void) => void;
}

abstract class BaseElement {
  children: BaseElement[] = [];
  element: Element;
  events: EventMap = {};
  eventTarget?: Element;

  constructor(update: (state: any) => void, children?: BaseElement[]) {
    this.children = children;
    this.element = this.createHTMLElement();
    Object.entries(this.events).forEach(([eventType, callback]) => {
      const target = this.eventTarget ?? this.element;
      target.addEventListener(eventType, (event) => callback(event, update));
    });
  }

  abstract createHTMLElement(): Element;

  render(state): Element {
    const self = this.renderSelf(state);
    const children = this.renderChildren(state);
    children.forEach((child) => {
      self.appendChild(child);
    });
    return self;
  }

  renderChildren(options): Element[] {
    return this.children.map((child) => child.renderSelf(options));
  }

  abstract renderSelf(options): Element;
}

class PlayerBaseElement extends BaseElement {
  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "p51";
    return element;
  }

  renderSelf(state) {
    return this.element;
  }
}

class ImageElement extends BaseElement {
  createHTMLElement() {
    const element = document.createElement("img");
    element.className = "p51-image";
    element.setAttribute("loading", "lazy");
    return element;
  }

  renderSelf(state) {
    this.element.setAttribute("src", state.config.src);
    this.element.setAttribute("type", state.config.mimeType);
    return this.element;
  }
}

class CanvasElement extends BaseElement {
  events: EventMap = {
    click: (event, update) => {
      update({ showOptions: false });
    },
    mouseenter: (event, update) => {
      update({ canFocus: true });
    },
    mouseleave: (event, update) => {
      update({ canFocus: false, tooltipOverlay: null });
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

  renderSelf(state) {
    return this.element;
  }
}

class ControlsElement extends BaseElement {
  events: EventMap = {
    click: (event, update) => {
      update({
        showControls: false,
        disableShowControls: true,
        showOptions: false,
      });
    },
    mouseenter: (event, update) => {
      update({ tooltipOverlay: null, hoveringControls: true, canFocus: false });
    },
    mouseleave: (event, update) => {
      update({ hoveringControls: false });
    },
  };

  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "p51-controls";
    return element;
  }

  renderSelf(state) {
    return this.element;
  }
}

class OptionsButtonElement extends BaseElement {
  events = {
    click: (event, update) => {
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

  renderSelf(state) {
    return this.element;
  }
}

class OptionsPanelElement extends BaseElement {
  events = {
    mouseenter: (event, update) => {
      update({ tooltipOverlay: null, hoveringControls: true });
    },
    mouseleave: (event, update) => {
      update({ hoveringControls: false });
    },
  };

  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "p51-options-panel";
    return element;
  }

  renderSelf(state) {
    return this.element;
  }
}

class OnlyShowHoveredOnLabelOptionElement extends BaseElement {
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

class ShowAttributesOptionElement extends BaseElement {
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

class ShowConfidenceOptionElement extends BaseElement {
  checkbox: HTMLInputElement;
  label: HTMLLabelElement;

  events = {
    change: (event, update) => {
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

class ShowTooltipOptionElement extends BaseElement {
  checkbox: HTMLInputElement;
  label: HTMLLabelElement;

  events = {
    change: (event, update) => {
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

interface ElementsTemplate {
  node: new (
    update: (state: any) => void,
    children?: BaseElement[]
  ) => BaseElement;
  children?: ElementsTemplate[];
}

function createElementsTree(
  root: ElementsTemplate,
  update: (state: any) => void
) {
  const children = root.children
    ? root.children.map((child) => createElementsTree(child, update))
    : [];

  return new root.node(update, children);
}

export const getImageElements = (update: (state: any) => void) => {
  const elements = {
    node: PlayerBaseElement,
    children: [
      { node: ImageElement },
      { node: ControlsElement, children: [{ node: OptionsButtonElement }] },
      { node: CanvasElement },
      {
        node: OptionsPanelElement,
        children: [
          { node: OnlyShowHoveredOnLabelOptionElement },
          { node: ShowAttributesOptionElement },
          { node: ShowConfidenceOptionElement },
          { node: ShowTooltipOptionElement },
        ],
      },
    ],
  };

  return createElementsTree(elements, update);
};
