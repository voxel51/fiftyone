import { ImaVidState } from "../../state";
import { BaseElement, Events } from "..//base";

import { lookerPlaybackRate } from "../video.module.css";

export class PlaybackRateContainerElement extends BaseElement<
  ImaVidState,
  HTMLDivElement
> {
  getEvents(): Events<ImaVidState> {
    return {};
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.classList.add(lookerPlaybackRate);
    return element;
  }

  renderSelf() {
    return this.element;
  }
}
