/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState, VideoState } from "../../state";
import { BaseElement, Events } from "../base";

import {
  lookerOptionsPanel,
  lookerOptionsInput,
  lookerCheckbox,
  lookerLabel,
} from "./options.module.css";

export class OptionsPanelElement<State extends BaseState> extends BaseElement<
  State
> {
  private showOptions: boolean = false;
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
    element.classList.add(lookerOptionsPanel);
    return element;
  }

  isShown({ config: { thumbnail } }: Readonly<State>) {
    return !thumbnail;
  }

  renderSelf({ showOptions, config: { thumbnail } }: Readonly<State>) {
    if (thumbnail) {
      return this.element;
    }
    if (this.showOptions === showOptions) {
      return this.element;
    }
    if (showOptions) {
      this.element.style.opacity = "0.9";
      this.element.style.display = "none";
    } else {
      this.element.style.opacity = "0.0";
      this.element.style.display = "grid";
    }
    this.showOptions = showOptions;
    return this.element;
  }
}

export class UseFrameNumberOptionElement extends BaseElement<VideoState> {
  checkbox?: HTMLInputElement;
  label?: HTMLLabelElement;

  getEvents(): Events<VideoState> {
    return {
      click: ({ event, update }) => {
        event.stopPropagation();
        event.preventDefault();
        update(({ options: { useFrameNumber } }) => {
          return {
            options: { useFrameNumber: !useFrameNumber },
          };
        });
      },
    };
  }

  createHTMLElement() {
    [this.label, this.checkbox] = makeCheckboxRow("Use frame number", false);
    return makeWrapper([this.label]);
  }

  renderSelf({ options: { useFrameNumber } }: Readonly<VideoState>) {
    // @ts-ignore
    this.checkbox.checked = useFrameNumber;
    return this.element;
  }
}

export class OnlyShowHoveredOnLabelOptionElement<
  State extends BaseState
> extends BaseElement<State> {
  checkbox?: HTMLInputElement;
  label?: HTMLLabelElement;

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

  renderSelf({ options: { onlyShowHoveredLabel } }: Readonly<State>) {
    //@ts-ignore
    this.checkbox.checked = onlyShowHoveredLabel;
    return this.element;
  }
}

export class ShowLabelOptionElement<
  State extends BaseState
> extends BaseElement<State> {
  checkbox?: HTMLInputElement;
  label?: HTMLLabelElement;

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

  renderSelf({ options: { showLabel } }: Readonly<State>) {
    // @ts-ignore
    this.checkbox.checked = showLabel;
    return this.element;
  }
}

export class ShowConfidenceOptionElement<
  State extends BaseState
> extends BaseElement<State> {
  checkbox?: HTMLInputElement;
  label?: HTMLLabelElement;

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

  renderSelf({ options: { showConfidence } }: Readonly<State>) {
    // @ts-ignore
    this.checkbox.checked = showConfidence;
    return this.element;
  }
}

export class ShowTooltipOptionElement<
  State extends BaseState
> extends BaseElement<State> {
  checkbox?: HTMLInputElement;
  label?: HTMLLabelElement;

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

  renderSelf({ options: { showTooltip } }: Readonly<State>) {
    // @ts-ignore
    this.checkbox.checked = showTooltip;
    return this.element;
  }
}

const makeWrapper = function (children: HTMLElement[]) {
  const wrapper = document.createElement("div");
  wrapper.classList.add(lookerOptionsInput);
  for (const child of children) {
    wrapper.appendChild(child);
  }
  return wrapper;
};

const makeCheckboxRow = function (
  text: string,
  checked: boolean
): [HTMLLabelElement, HTMLInputElement] {
  const label = document.createElement("label");
  label.classList.add(lookerLabel);
  label.innerHTML = text;

  const checkbox = document.createElement("input");
  checkbox.setAttribute("type", "checkbox");
  checkbox.checked = checked;
  const span = document.createElement("span");
  span.classList.add(lookerCheckbox);
  label.appendChild(checkbox);
  label.appendChild(span);

  return [label, checkbox];
};
