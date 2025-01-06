/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { SELECTION_TEXT } from "../../constants";
import type { BaseState, Control } from "../../state";
import { ControlEventKeyType } from "../../state";
import type { Events } from "../base";
import { BaseElement } from "../base";

import { looker, lookerError, lookerHighlight } from "./looker.module.css";

export class LookerElement<State extends BaseState> extends BaseElement<
  State,
  HTMLDivElement
> {
  private selection: boolean;
  private highlight: boolean;

  getEvents(): Events<State> {
    return {
      keydown: ({ event, update, dispatchEvent }) => {
        if (event.altKey || event.ctrlKey || event.metaKey) {
          return;
        }

        const e = event as KeyboardEvent;
        update((state) => {
          const {
            SHORTCUTS,
            error,
            options: { shouldHandleKeyEvents },
          } = state;
          if (!error && e.key in SHORTCUTS) {
            const matchedControl = SHORTCUTS[e.key] as Control;
            const enabled =
              shouldHandleKeyEvents || matchedControl.alwaysHandle;
            if (enabled) {
              matchedControl.action(update, dispatchEvent, e.key, e.shiftKey);
            }
          }

          return {};
        });
      },
      keyup: ({ event, update, dispatchEvent }) => {
        if (event.altKey || event.ctrlKey || event.metaKey) {
          return;
        }

        const e = event as KeyboardEvent;
        update(({ SHORTCUTS, error, options: { shouldHandleKeyEvents } }) => {
          if (!error && e.key in SHORTCUTS) {
            const matchedControl = SHORTCUTS[e.key] as Control;

            const enabled =
              shouldHandleKeyEvents || matchedControl.alwaysHandle;

            if (
              enabled &&
              matchedControl.eventKeyType === ControlEventKeyType.HOLD
            ) {
              matchedControl.afterAction(
                update,
                dispatchEvent,
                e.key,
                e.shiftKey
              );
            }
          }

          return {};
        });
      },
      mouseenter: ({ update }) => {
        update({ hovering: true });
      },
      mousemove: ({ update, dispatchEvent }) => {
        update((state) => {
          !state.options.showControls &&
            dispatchEvent("options", { showControls: true });

          return {};
        });
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.setAttribute("data-cy", "looker");
    element.classList.add(looker);
    element.tabIndex = -1;
    return element;
  }

  renderSelf({
    hovering,
    error,
    config: { thumbnail },
    options: { highlight, inSelectionMode },
  }: Readonly<State>) {
    if (!thumbnail && hovering && this.element !== document.activeElement) {
      this.element.focus();
    }

    if (highlight !== this.highlight) {
      this.highlight = highlight;
      highlight
        ? this.element.classList.add(lookerHighlight)
        : this.element.classList.remove(lookerHighlight);
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
