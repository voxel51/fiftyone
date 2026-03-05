/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { SELECTION_TEXT } from "../../constants";
import { BaseState } from "../../state";
import { BaseElement, Events } from "../base";

import { lookerThumbnailSelector, showSelector } from "./thumbnail.module.css";
import {
  selectionIconCheckmark,
  selectionIconGreenCheckmark,
  selectionIconRedCheckmark,
  selectionIconThumbsup,
  selectionIconThumbsdown,
  selectionIconPin,
  selectionIconStar,
  selectionIconX,
  selectionIconBookmark,
} from "./util.module.css";
import { makeCheckboxRow } from "./util";

const ICON_CLASS_MAP: Record<string, string> = {
  checkmark: selectionIconCheckmark,
  "green-checkmark": selectionIconGreenCheckmark,
  "red-checkmark": selectionIconRedCheckmark,
  thumbsup: selectionIconThumbsup,
  thumbsdown: selectionIconThumbsdown,
  pin: selectionIconPin,
  star: selectionIconStar,
  x: selectionIconX,
  bookmark: selectionIconBookmark,
};

const ALL_ICON_CLASSES = Object.values(ICON_CLASS_MAP);

export class ThumbnailSelectorElement<
  State extends BaseState
> extends BaseElement<State> {
  private shown: boolean;
  private selected: boolean;
  private currentIcon: string | null;
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

          dispatchEvent("selectthumbnail", {
            shiftKey: event.shiftKey,
            altKey: event.altKey,
          });

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
      options: { selected, selectionIcon, inSelectionMode, thumbnailTitle },
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

    if (this.currentIcon !== selectionIcon && this.checkbox) {
      // Remove previous icon class
      for (const cls of ALL_ICON_CLASSES) {
        this.checkbox.classList.remove(cls);
      }
      // Add new icon class
      if (selectionIcon && ICON_CLASS_MAP[selectionIcon]) {
        this.checkbox.classList.add(ICON_CLASS_MAP[selectionIcon]);
      }
      this.currentIcon = selectionIcon;
    }

    if (thumbnailTitle && thumbnailTitle(sample) !== this.titleText) {
      this.titleText = thumbnailTitle(sample);
      this.title.innerText = this.titleText;
    }

    return this.element;
  }
}
