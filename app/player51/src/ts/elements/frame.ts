/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseElement } from "./base";
import { getFrameString, getTimeString } from "./util";

export class FrameNumberElement extends BaseElement {
  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "p51-time";
    element.style.gridArea = "2 / 3 / 2 / 3";
    return element;
  }

  renderSelf({
    currentTime,
    duration,
    frameRate,
    options: { useFrameNumber },
  }) {
    const timestamp = useFrameNumber
      ? getFrameString(currentTime, duration, frameRate)
      : getTimeString(currentTime, duration);
    this.element.innerHTML = timestamp;
    return this.element;
  }
}

export class FrameElement extends BaseElement {
  private src: string;

  createHTMLElement() {
    const element = document.createElement("video");
    element.className = "p51-video";
    element.setAttribute("preload", "metadata");
    element.muted = true; // this works whereas .setAttribute does not
    return element;
  }

  renderSelf({ config: { src } }) {
    this.element.setAttribute("src", src);
    return this.element;
  }
}
