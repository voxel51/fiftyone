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

import { mediaOrCanvas, mediaLoading } from "./media.module.css";
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
  private frameNumber: number = 1;
  private loaded: boolean = false;

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
    element.classList.add(mediaOrCanvas, mediaLoading);
    element.preload = "metadata";
    element.muted = true;
    return element;
  }

  renderSelf(state: Readonly<FrameState>) {
    const {
      loaded,
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

    if (this.loaded !== loaded) {
      this.element.classList.remove(mediaLoading);
      this.loaded = loaded;
    }

    transformWindowElement(state, this.element);
    return this.element;
  }
}
