/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseElement } from "./base";
import {
  getFrameString,
  getTimeString,
  ICONS,
  makeCheckboxRow,
  makeWrapper,
} from "./util";

export class PlayButtonElement extends BaseElement {
  element: HTMLImageElement;
  private playing: boolean = false;

  createHTMLElement() {
    const element = document.createElement("img");
    element.className = "p51-clickable";
    element.style.gridArea = "2 / 2 / 2 / 2";
    return element;
  }

  renderSelf({ playing }) {
    if (playing !== this.playing) {
      if (playing) {
        this.element.src = ICONS.pause;
        this.element.title = "Pause (space)";
      } else {
        this.element.src = ICONS.pause;
        this.element.title = "Pause (space)";
      }
      this.playing = playing;
    }
    return this.element;
  }
}

export class SeekBarElement extends BaseElement {
  private currentTime: number;

  createHTMLElement() {
    const element = document.createElement("input");
    element.setAttribute("type", "range");
    element.setAttribute("min", "0");
    element.setAttribute("max", "100");
    element.className = "p51-seek-bar";
    element.style.gridArea = "1 / 2 / 1 / 6";
    return element;
  }

  renderSelf({ currentTime }) {
    this.element.setAttribute("value", currentTime.toString());
    return this.element;
  }
}

export class UseFrameNumberOptionElement extends BaseElement {
  checkbox: HTMLInputElement;
  label: HTMLLabelElement;

  createHTMLElement() {
    [this.label, this.checkbox] = makeCheckboxRow("Use frame number", false);
    return makeWrapper([this.label]);
  }

  renderSelf({ options: { useFrameNumber } }) {
    this.checkbox.checked = useFrameNumber;
    return this.element;
  }
}

export class TimeElement extends BaseElement {
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

export class VideoElement extends BaseElement {
  events = {
    error: ({ event, update }) => {
      update({ errors: event.error });
    },
  };

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
