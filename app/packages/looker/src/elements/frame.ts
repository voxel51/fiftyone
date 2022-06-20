/**
 * Copyright 2017-2022, Voxel51, Inc.
 */

import { DispatchEvent, FrameState, StateUpdate } from "../state";
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
      this.element.innerHTML = getFrameString(frameNumber, duration, frameRate);
    }
    return this.element;
  }
}

export class FrameElement extends BaseElement<FrameState, null> {
  imageSource: HTMLCanvasElement;

  createHTMLElement(update: StateUpdate<FrameState>) {
    this.imageSource = document.createElement("canvas");
    this.imageSource.style.imageRendering = "pixelated";

    update(
      ({ config: { thumbnail, dimensions, src, frameRate, frameNumber } }) => {
        this.imageSource.width = dimensions[0];
        this.imageSource.height = dimensions[1];
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
                  update({
                    loaded: true,
                    duration: video.duration,
                  });
                }, 20);
              });
            });
          };
          video.addEventListener("seeked", seeked);

          const error = () => {
            video.removeEventListener("error", error);
            release();
            update({ error: true });
          };

          const loaded = () => {
            video.currentTime = getTime(frameNumber, frameRate);
            update({ duration: video.duration });
            video.removeEventListener("error", error);
            video.removeEventListener("loadedmetadata", loaded);
          };

          video.addEventListener("error", error);
          video.addEventListener("loadedmetadata", loaded);
          video.src = src;
        });

        return {};
      }
    );

    return null;
  }

  renderSelf() {
    return null;
  }
}
