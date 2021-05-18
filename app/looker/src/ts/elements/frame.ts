/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { FrameState } from "../state";
import { BaseElement } from "./base";
import { getFrameString, getTimeString } from "./util";

export class FrameNumberElement extends BaseElement<FrameState> {
  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "p51-time";
    element.style.gridArea = "2 / 3 / 2 / 3";
    return element;
  }

  renderSelf({
    duration,
    config: { frameRate, frameNumber },
    options: { useFrameNumber },
  }) {
    if (duration) {
      const timestamp = useFrameNumber
        ? getFrameString(frameNumber, duration, frameRate)
        : getTimeString(frameNumber, frameRate, duration);
      this.element.innerHTML = timestamp;
    }
    return this.element;
  }
}

export class FrameElement extends BaseElement<FrameState> {
  private src: string;

  createHTMLElement() {
    const element = document.createElement("video");
    element.className = "p51-video";
    element.setAttribute("preload", "metadata");
    element.muted = true; // this works whereas .setAttribute does not
    return element;
  }

  renderSelf({ config: { src } }) {
    if (this.src !== src) {
      this.src = src;
      this.element.setAttribute("src", src);
    }
    return this.element;
  }
}
