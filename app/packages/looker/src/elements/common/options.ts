/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { BaseState, ImaVidState, VideoState } from "../../state";
import { BaseElement, Events } from "../base";

import { lookerOptionsInput, lookerOptionsPanel } from "./options.module.css";
import { makeCheckboxRow } from "./util";

export class OptionsPanelElement<
  State extends BaseState
> extends BaseElement<State> {
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
    element.setAttribute("data-cy", "looker-options-panel");
    element.classList.add(lookerOptionsPanel);
    return element;
  }

  isShown({ thumbnail }: Readonly<State["config"]>) {
    return !thumbnail;
  }

  renderSelf({ showOptions }: Readonly<State>) {
    if (this.showOptions === showOptions) {
      return this.element;
    }
    if (showOptions) {
      this.element.style.opacity = "0.95";
      this.element.style.display = "grid";
    } else {
      this.element.style.opacity = "0.0";
      this.element.style.display = "none";
    }
    this.showOptions = showOptions;
    return this.element;
  }
}

export class LoopVideoOptionElement<
  State extends ImaVidState | VideoState = VideoState
> extends BaseElement<State> {
  checkbox?: HTMLInputElement;
  label?: HTMLLabelElement;

  getEvents(): Events<State> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        update(({ options: { loop } }) => {
          dispatchEvent("options", { loop: !loop });
          return { options: { loop: !loop } };
        });
      },
    };
  }

  createHTMLElement() {
    [this.label, this.checkbox] = makeCheckboxRow("Loop video", false);
    return makeWrapper([this.label]);
  }

  renderSelf({ options: { loop } }: Readonly<State>) {
    //@ts-ignore
    this.checkbox.checked = loop;
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

export class ShowIndexOptionElement<
  State extends BaseState
> extends BaseElement<State> {
  checkbox?: HTMLInputElement;
  label?: HTMLLabelElement;

  getEvents(): Events<State> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        update(({ options: { showIndex } }) => {
          dispatchEvent("options", { showIndex: !showIndex });
          return {
            options: { showIndex: !showIndex },
          };
        });
      },
    };
  }

  createHTMLElement() {
    [this.label, this.checkbox] = makeCheckboxRow("Show index", false);
    return makeWrapper([this.label]);
  }

  renderSelf({ options: { showIndex } }: Readonly<State>) {
    // @ts-ignore
    this.checkbox.checked = showIndex;
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

export class UseFrameNumberOptionElement extends BaseElement<VideoState> {
  checkbox?: HTMLInputElement;
  label?: HTMLLabelElement;

  getEvents(): Events<VideoState> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        update(({ options: { useFrameNumber } }) => {
          dispatchEvent("options", { useFrameNumber: !useFrameNumber });
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
