/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { FrameState } from "../state";
import { BaseElement, Events } from "./base";
import { getFrameString, getTime, getTimeString } from "./util";

import { mediaOrCanvas, invisible } from "./media.module.css";
import { lookerTime } from "./common/controls.module.css";

export class FrameNumberElement extends BaseElement<FrameState> {
  createHTMLElement() {
    const element = document.createElement("div");
    element.classList.add(lookerTime);
    element.style.gridArea = "2 / 3 / 2 / 3";
    return element;
  }

  renderSelf({
    duration,
    config: { frameRate, frameNumber },
    options: { useFrameNumber },
  }: Readonly<FrameState>) {
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
  private src: string = "";

  getEvents(): Events<FrameState> {
    return {
      error: ({ event, dispatchEvent }) => {
        dispatchEvent("error", { event });
      },
      loadedmetadata: ({ update }) => {
        update(({ config: { frameNumber, frameRate } }) => {
          this.element.currentTime = getTime(frameNumber, frameRate);
          return {
            duration: this.element.duration,
          };
        });
      },
      seeked: ({ update, dispatchEvent }) => {
        update({ loaded: true });
        dispatchEvent("loaded");
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("video");
    element.classList.add(mediaOrCanvas, invisible);
    element.preload = "metadata";
    element.muted = true;
    return element;
  }

  renderSelf(state: Readonly<FrameState>) {
    const {
      config: { src },
    } = state;
    if (this.src !== src) {
      this.src = src;
      this.element.setAttribute("src", src);
    }

    return this.element;
  }
}
