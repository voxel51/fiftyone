/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState } from "../../state";
import { BaseElement, Events } from "../base";

import { lookerThumbnailSelector } from "./thumbnail.module.css";
import { makeCheckboxRow } from "./util";

export class ThumbnailSelectorElement<
  State extends BaseState
> extends BaseElement<State> {
  private hovering: boolean;
  getEvents(): Events<State> {
    return {
      click: ({ event, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
      },
    };
  }

  createHTMLElement() {
    [this.label, this.checkbox] = makeCheckboxRow(
      "Only show hovered label",
      false
    );
    const element = document.createElement("div");
    element.classList.add(lookerThumbnailSelector);
    element.appendChild(this.label);

    return element;
  }

  isShown({ thumbnail }: Readonly<State["config"]>) {
    return thumbnail;
  }

  renderSelf({ hovering }: Readonly<State>) {
    if (this.hovering === hovering) {
      return this.element;
    }
    if (hovering || true) {
      this.element.style.opacity = "0.9";
      this.element.style.display = "grid";
    } else {
      this.element.style.opacity = "0.0";
      this.element.style.display = "none";
    }
    return this.element;
  }
}
