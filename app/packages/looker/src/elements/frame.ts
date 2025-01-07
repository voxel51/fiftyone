/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { FrameState, StateUpdate } from "../state";
import { BaseElement, Events } from "./base";
import {
  acquirePlayer,
  acquireThumbnailer,
  getFrameString,
  getTime,
} from "./util";

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
      this.element.textContent = getFrameString(
        frameNumber,
        duration,
        frameRate
      );
    }
    return this.element;
  }
}

export class FrameElement extends BaseElement<FrameState, null> {
  imageSource: HTMLCanvasElement;

  createHTMLElement() {
    this.imageSource = document.createElement("canvas");
    this.imageSource.style.imageRendering = "pixelated";

    this.update(({ config: { thumbnail, src, frameRate, frameNumber } }) => {
      this.src = src;

      const acquirer = thumbnail ? acquireThumbnailer : acquirePlayer;

      acquirer().then(([video, release]) => {
        const seeked = () => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setTimeout(() => {
                const ctx = this.imageSource.getContext("2d");
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(video, 0, 0);
                release();
                video.removeEventListener("seeked", seeked);
                this.update({
                  loaded: true,
                  duration: video.duration,
                });
              }, 20);
            });
          });
        };
        video.addEventListener("seeked", seeked);

        const error = (event) => {
          // Chrome v60
          if (event.path && event.path[0]) {
            event = event.path[0].error;
          }

          // Firefox v55
          if (event.originalTarget) {
            event = event.originalTarget.error;
          }
          video.removeEventListener("error", error);
          release();
          this.update({ error: true, loaded: true, dimensions: [512, 512] });
        };

        const loaded = () => {
          video.currentTime = getTime(frameNumber, frameRate);
          this.update({ duration: video.duration });
          video.removeEventListener("error", error);
          video.removeEventListener("loadedmetadata", loaded);
          this.imageSource.width = video.videoWidth;
          this.imageSource.height = video.videoHeight;
          this.update({ dimensions: [video.videoWidth, video.videoHeight] });
        };

        video.src = src;
        video.addEventListener("error", error);
        video.addEventListener("loadedmetadata", loaded);
      });

      return {};
    });

    return null;
  }

  renderSelf() {
    return null;
  }
}
