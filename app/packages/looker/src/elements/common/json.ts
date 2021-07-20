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
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        update({ options: { showJSON: false } });
        dispatchEvent("options", { showJSON: false });
      },
      dblclick: ({ event }) => {
        event.stopPropagation();
        event.preventDefault();
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.classList.add(lookerPanel);

    const container = document.createElement("div");
    container.classList.add(lookerJSONPanel);
    container.classList.add(lookerPanelContainer);

    const vContainer = document.createElement("div");
    vContainer.classList.add(lookerPanelVerticalContainer);

    vContainer.appendChild(element);

    container.appendChild(vContainer);
    element.appendChild(document.createElement("pre"));

    return container;
  }

  isShown({ thumbnail }: Readonly<State["config"]>) {
    return !thumbnail;
  }

  renderSelf({ options: { showJSON } }: Readonly<State>) {
    if (this.json === showJSON) {
      return this.element;
    }
    if (showJSON) {
      this.element.style.opacity = "0.9";
      this.element.style.display = "flex";
    } else {
      this.element.style.opacity = "0.0";
      this.element.style.display = "none";
    }
    this.json = showJSON;
    return this.element;
  }
}
