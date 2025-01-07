/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { BaseState } from "../../state";
import { BaseElement, Events } from "../base";

import commonControls from "../common/controls.module.css";

export class ImaVidControlsElement<
  State extends BaseState
> extends BaseElement<State> {
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
    element.setAttribute("data-cy", "looker-controls");
    element.classList.add(commonControls.lookerControls);
    element.classList.add(commonControls.imaVidLookerControls);
    return element;
  }

  isShown({ thumbnail }: Readonly<State["config"]>) {
    return !thumbnail;
  }

  renderSelf() {
    return this.element;
  }
}
