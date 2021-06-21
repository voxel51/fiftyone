/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { FrameState } from "../state";
import { BaseElement, Events } from "./base";
import {
  getFrameString,
  getTime,
  getTimeString,
  transformWindowElement,
} from "./util";

import { mediaOrCanvas } from "./index.module.css";

export class FrameNumberElement extends BaseElement<FrameState> {
  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "looker-time";
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

export class FrameElement extends BaseElement<FrameState, HTMLVideoElement> {
  private src: string;
  private frameNumber: number;

  getEvents(): Events<FrameState> {
    return {
      error: ({ event, dispatchEvent }) => {
        dispatchEvent("error", { event });
      },
      loadeddata: ({ update, dispatchEvent }) => {
        update(({}) => {
          return {
            loaded: true,
            duration: this.element.duration,
          };
        });
        dispatchEvent("load");
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("video");
    element.preload = "metadata";
    element.muted = true;
    return element;
  }

  renderSelf(state) {
    const {
      config: { src, frameNumber, frameRate },
    } = state;
    if (this.src !== src) {
      this.src = src;
      this.element.setAttribute("src", src);
    }
    if (this.frameNumber !== frameNumber) {
      this.frameNumber = frameNumber;
      this.element.currentTime = getTime(frameNumber, frameRate);
    }
    transformWindowElement(state, this.element);
    return this.element;
  }
}
