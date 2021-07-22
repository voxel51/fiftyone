/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { SELECTION_TEXT } from "../../constants";
import { BaseState } from "../../state";
import { BaseElement, Events } from "../base";

import {
  lookerThumbnailSelector,
  showSelector,
  lookerThumbnailExpand,
} from "./thumbnail.module.css";
import { makeCheckboxRow } from "./util";

export class ThumbnailSelectorElement<
  State extends BaseState
> extends BaseElement<State> {
  private expand: boolean;
  private shown: boolean;
  private selected: boolean;
  private checkbox: HTMLInputElement;
  private label: HTMLLabelElement;

  getEvents(): Events<State> {
    return {
      click: ({ event, update }) => {
        event.stopPropagation();
        event.preventDefault();
        update(({ options: { selected } }) => ({
          options: { selected: !selected },
        }));
      },
    };
  }

  createHTMLElement() {
    [this.label, this.checkbox] = makeCheckboxRow("", false);
    this.checkbox.checked = false;
    const element = document.createElement("div");
    element.classList.add(lookerThumbnailSelector);
    element.appendChild(this.label);
    element.title = SELECTION_TEXT;

    return element;
  }

  isShown({ thumbnail }: Readonly<State["config"]>) {
    return thumbnail;
  }

  renderSelf({
    hovering,
    options: { selected, inSelectionMode },
  }: Readonly<State>) {
    const shown = hovering || selected || inSelectionMode;
    if (this.shown !== shown) {
      shown
        ? this.element.classList.add(showSelector)
        : this.element.classList.remove(showSelector);
      this.shown = shown;
    }

    if (this.selected !== selected) {
      this.checkbox.checked = selected;
      this.selected = selected;
    }

    if (this.expand !== inSelectionMode || hovering) {
      this.expand
        ? this.element.classList.add(lookerThumbnailExpand)
        : this.element.classList.remove(lookerThumbnailExpand);

      this.expand = inSelectionMode || hovering;
    }

    return this.element;
  }
}
