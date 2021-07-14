/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState } from "../../state";
import { BaseElement, Events } from "../base";

import {
  lookerPanel,
  lookerPanelContainer,
  lookerPanelHeader,
  lookerPanelVerticalContainer,
} from "./panel.module.css";
import { lookerJSONPanel } from "./json.module.css";

export class JSONPanelElement<State extends BaseState> extends BaseElement<
  State
> {
  private json?: boolean;
  getEvents(): Events<State> {
    return {
      click: ({ event, update }) => {
        event.stopPropagation();
        event.preventDefault();
        update({ showHelp: false });
      },
      dblclick: ({ event }) => {
        event.stopPropagation();
        event.preventDefault();
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    const header = document.createElement("div");
    header.innerText = "JSON";
    header.classList.add(lookerPanelHeader);
    element.appendChild(header);
    element.classList.add(lookerPanel);
    element.classList.add(lookerJSONPanel);

    const container = document.createElement("div");
    container.classList.add(lookerPanelContainer);

    const vContainer = document.createElement("div");
    vContainer.classList.add(lookerPanelVerticalContainer);

    vContainer.appendChild(element);

    container.appendChild(vContainer);

    return container;
  }

  isShown({ config: { thumbnail } }: Readonly<State>) {
    return !thumbnail;
  }

  renderSelf({ json, config: { thumbnail } }: Readonly<State>) {
    if (thumbnail) {
      return this.element;
    }
    if (this.json === json) {
      return this.element;
    }
    if (json) {
      this.element.style.opacity = "0.9";
      this.element.style.display = "flex";
    } else {
      this.element.style.opacity = "0.0";
      this.element.style.display = "none";
    }
    this.json = json;
    return this.element;
  }
}
