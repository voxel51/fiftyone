import { ImaVidState } from "../../state";
import { BaseElement, Events } from "..//base";
import { resetPlaybackRate } from "../common/actions";
import { lookerClickable } from "../common/controls.module.css";

import { playbackRate } from "../../icons";

export class PlaybackRateIconElement extends BaseElement<
  ImaVidState,
  HTMLDivElement
> {
  getEvents(): Events<ImaVidState> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        resetPlaybackRate.action(update, dispatchEvent);
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.classList.add(lookerClickable);
    element.style.padding = "2px";
    element.style.display = "flex";
    element.title = "Reset playback rate (p)";
    element.appendChild(playbackRate);
    return element;
  }

  renderSelf() {
    return this.element;
  }
}
