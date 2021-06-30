/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState } from "../../state";
import { BaseElement, Events } from "../base";
import { COMMON_SHORTCUTS } from "./actions";

import { looker, lookerFullscreen, lookerLoading } from "./looker.module.css";

export class LookerElement<State extends BaseState> extends BaseElement<
  State,
  HTMLDivElement
> {
  getEvents(): Events<State> {
    return {
      keydown: ({ event, update, dispatchEvent }) => {
        const e = event as KeyboardEvent;
        if (e.key in COMMON_SHORTCUTS) {
          COMMON_SHORTCUTS[e.key].action(update, dispatchEvent);
        }
      },
      mouseenter: ({ update, dispatchEvent }) => {
        dispatchEvent("mouseenter");
        update(({ config: { thumbnail } }) => {
          if (thumbnail) {
            return { hovering: true };
          }
          return {
            hovering: true,
            showControls: true,
          };
        });
      },
      mouseleave: ({ update, dispatchEvent }) => {
        dispatchEvent("mouseleave");
        update({
          hovering: false,
          disableControls: false,
          showControls: false,
          showOptions: false,
          showHelp: false,
          panning: false,
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
    config: { thumbnail },
    options: { fullscreen },
  }: Readonly<State>) {
    if (!thumbnail && hovering && this.element !== document.activeElement) {
      this.element.focus();
    }

    const fullscreenClass = this.element.classList.contains(lookerFullscreen);
    if (fullscreen && !fullscreenClass) {
      this.element.classList.add(lookerFullscreen);
    } else if (!fullscreen && fullscreenClass) {
      this.element.classList.remove(lookerFullscreen);
    }

    return this.element;
  }
}
