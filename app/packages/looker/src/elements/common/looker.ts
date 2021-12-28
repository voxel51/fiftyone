/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { SELECTION_TEXT } from "../../constants";
import { BaseState } from "../../state";
import { BaseElement, Events } from "../base";

import { looker, lookerError } from "./looker.module.css";

export class LookerElement<State extends BaseState> extends BaseElement<
  State,
  HTMLDivElement
> {
  private selection: boolean;

  getEvents(): Events<State> {
    return {
      keydown: ({ event, update, dispatchEvent }) => {
        if (event.altKey || event.ctrlKey || event.metaKey) {
          return;
        }

        const e = event as KeyboardEvent;
        update(({ SHORTCUTS, error }) => {
          if (!error && e.key in SHORTCUTS) {
            SHORTCUTS[e.key].action(update, dispatchEvent, e.key, e.shiftKey);
          }

          return {};
        });
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.classList.add(looker);
    element.tabIndex = -1;
    return element;
  }

  renderSelf({
    hovering,
    error,
    config: { thumbnail },
    options: { inSelectionMode },
  }: Readonly<State>) {
    if (!thumbnail && hovering && this.element !== document.activeElement) {
      this.element.focus();
    }

    if (error && !thumbnail) {
      this.element.classList.add(lookerError);
    }

    if (thumbnail && inSelectionMode !== this.selection) {
      this.selection = inSelectionMode;
      this.element.title = inSelectionMode ? SELECTION_TEXT : "Click to expand";
    }

    return this.element;
  }
}
