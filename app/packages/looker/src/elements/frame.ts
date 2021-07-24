/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { FrameState } from "../state";
import { BaseElement, Events } from "./base";
import { getFrameString, getTime } from "./util";

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
  }: Readonly<FrameState>) {
    if (duration) {
      this.element.innerHTML = getFrameString(frameNumber, duration, frameRate);
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

    return null;
  }
}
