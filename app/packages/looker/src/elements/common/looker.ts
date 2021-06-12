/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseState } from "../../state";
import { BaseElement, Events } from "../base";
import {
  dispatchTooltipEvent,
  toggleFullscreen,
  toggleOptions,
  zoomIn,
  zoomOut,
} from "./util";

export class LookerElement<State extends BaseState> extends BaseElement<
  State,
  HTMLDivElement
> {
  getEvents(): Events<State> {
    return {
      keydown: ({ event, update, dispatchEvent }) => {
        const e = event as KeyboardEvent;
        switch (e.key) {
          case "-":
            zoomOut(update);
            return;
          case "+":
            zoomIn(update);
            return;
          case "ArrowDown":
            update(
              ({ rotate }) => ({ rotate: rotate + 1 }),
              dispatchTooltipEvent(dispatchEvent)
            );
            return;
          case "ArrowUp":
            update(
              ({ rotate }) => ({ rotate: Math.max(rotate - 1, 0) }),
              dispatchTooltipEvent(dispatchEvent)
            );
            return;
          case "Escape":
            update({ showControls: false, showOptions: false });
            return;
          case "m":
            toggleFullscreen(update);
            return;
          case "s":
            toggleOptions(update);
            return;
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
          panning: false,
        });
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "looker loading";
    element.tabIndex = -1;
    return element;
  }

  renderSelf({ fullscreen, loaded, hovering, config: { thumbnail } }) {
    if (loaded && this.element.classList.contains("loading")) {
      this.element.classList.remove("loading");
    }
    if (!thumbnail && hovering && this.element !== document.activeElement) {
      this.element.focus();
    }

    const fullscreenClass = this.element.classList.contains("fullscreen");
    if (fullscreen && !fullscreenClass) {
      this.element.classList.add("fullscreen");
    } else if (!fullscreen && fullscreenClass) {
      this.element.classList.remove("fullscreen");
    }

    return this.element;
  }
}
