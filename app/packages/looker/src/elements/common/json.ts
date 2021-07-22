/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState } from "../../state";
import { BaseElement, Events } from "../base";

import {
  lookerPanel,
  lookerPanelContainer,
  lookerPanelVerticalContainer,
  lookerPanelClose,
} from "./panel.module.css";
import { lookerCopyJSON, lookerJSONPanel } from "./json.module.css";
import closeIcon from "../../icons/close.svg";
import clipboardIcon from "../../icons/clipboard.svg";

export class JSONPanelElement<State extends BaseState> extends BaseElement<
  State
> {
  private json?: boolean;
  getEvents(): Events<State> {
    return {
      click: ({ event, update }) => {
        event.stopPropagation();
        event.preventDefault();
        update({ options: { showJSON: false } });
      },
      dblclick: ({ event }) => {
        event.stopPropagation();
        event.preventDefault();
      },
    };
  }

  createHTMLElement(update, dispatchEvent) {
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

    element.onclick = (e) => e.stopPropagation();

    const close = document.createElement("img");
    close.src = closeIcon;
    close.classList.add(lookerPanelClose);
    close.onclick = () => {
      update({ options: { showJSON: false } });
      dispatchEvent("options", { showJSON: false });
    };
    close.title = "Close JSON";
    vContainer.appendChild(close);

    const copy = document.createElement("img");
    copy.src = clipboardIcon;
    copy.classList.add(lookerCopyJSON);
    copy.onclick = (e) => {
      e.stopPropagation();
      dispatchEvent("copy");
    };
    copy.title = "Copy JSON to clipboard";
    vContainer.appendChild(copy);

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
