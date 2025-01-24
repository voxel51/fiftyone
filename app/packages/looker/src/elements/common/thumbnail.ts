/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { SELECTION_TEXT } from "../../constants";
import { BaseState } from "../../state";
import { BaseElement, Events } from "../base";

import { lookerThumbnailSelector, showSelector } from "./thumbnail.module.css";
import { makeCheckboxRow } from "./util";

export class ThumbnailSelectorElement<
  State extends BaseState
> extends BaseElement<State> {
  private shown: boolean;
  private selected: boolean;
  private checkbox: HTMLInputElement;
  private label: HTMLLabelElement;
  private title: HTMLDivElement;
  private titleText: string;

  getEvents(): Events<State> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        update(({ options: { selected, inSelectionMode } }) => {
          if (inSelectionMode && (event.shiftKey || event.ctrlKey)) {
            return {};
          }
          event.stopPropagation();
          event.preventDefault();

          dispatchEvent("selectthumbnail", event.shiftKey);

          return { options: { selected: !selected } };
        });
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

    this.title = document.createElement("div");
    this.title.setAttribute("data-cy", "thumbnail-title");
    element.append(this.title);

    return element;
  }

  isShown({ thumbnail }: Readonly<State["config"]>) {
    return thumbnail;
  }

  renderSelf(
    {
      hovering,
      options: { selected, inSelectionMode, thumbnailTitle },
    }: Readonly<State>,
    sample
  ) {
    const shown = hovering || selected || inSelectionMode;
    if (this.shown !== shown) {
      shown
        ? this.element.classList.add(showSelector)
        : this.element.classList.remove(showSelector);
      this.shown = shown;
    }

    if (this.selected !== selected && this.checkbox) {
      this.selected = selected;
      this.checkbox.checked = selected;
    }

    if (thumbnailTitle && thumbnailTitle(sample) !== this.titleText) {
      this.titleText = thumbnailTitle(sample);
      this.title.innerText = this.titleText;
    }

    return this.element;
  }
}
