/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { SELECTION_TEXT } from "../../constants";
import { BaseState } from "../../state";
import { BaseElement, Events } from "../base";

import { lookerThumbnailSelector, showSelector } from "./thumbnail.module.css";
import { altSelectedCheckbox } from "./util.module.css";
import { makeCheckboxRow } from "./util";

export class ThumbnailSelectorElement<
  State extends BaseState
> extends BaseElement<State> {
  private shown: boolean;
  private selected: boolean;
  private altSelected: boolean;
  private checkbox: HTMLInputElement;
  private label: HTMLLabelElement;
  private title: HTMLDivElement;
  private titleText: string;

  getEvents(): Events<State> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        update(({ options: { selected, altSelected, inSelectionMode } }) => {
          if (inSelectionMode && (event.shiftKey || event.ctrlKey)) {
            return {};
          }
          event.stopPropagation();
          event.preventDefault();

          dispatchEvent("selectthumbnail", {
            shiftKey: event.shiftKey,
            altKey: event.altKey,
          });

          if (event.altKey) {
            return { options: { altSelected: !altSelected, selected: false } };
          }

          return { options: { selected: !selected, altSelected: false } };
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
      options: { selected, altSelected, inSelectionMode, thumbnailTitle },
    }: Readonly<State>,
    sample
  ) {
    const shown = hovering || selected || altSelected || inSelectionMode;
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

    if (this.altSelected !== altSelected && this.checkbox) {
      this.altSelected = altSelected;
      if (altSelected) {
        this.checkbox.classList.add(altSelectedCheckbox);
      } else {
        this.checkbox.classList.remove(altSelectedCheckbox);
      }
    }

    if (thumbnailTitle && thumbnailTitle(sample) !== this.titleText) {
      this.titleText = thumbnailTitle(sample);
      this.title.innerText = this.titleText;
    }

    return this.element;
  }
}
