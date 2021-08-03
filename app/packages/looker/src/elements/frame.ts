/**
 * Copyright 2017-2021, Voxel51, Inc.
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

export class FrameElement extends BaseElement<FrameState, HTMLVideoElement> {
  private src: string = "";
  imageSource: HTMLCanvasElement;

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

  createHTMLElement(
    update: StateUpdate<FrameState>,
    dispatchEvent: DispatchEvent
  ) {
    this.imageSource = document.createElement("canvas");

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
                this.imageSource.getContext("2d").drawImage(video, 0, 0);
                release();
                video.removeEventListener("seeked", seeked);
                update({
                  loaded: true,
                  duration: video.duration,
                });
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
              event = error.originalTarget.error;
            }
            video.removeEventListener("error", error);
            update({ error: true });
          };

          const loaded = () => {
            video.currentTime = getTime(frameNumber, frameRate);
            update({ duration: video.duration });
            video.removeEventListener("error", error);
            video.removeEventListener("loadedmetadata", loaded);
          };

          video.src = src;
          video.addEventListener("error", error);
          video.addEventListener("loadedmetadata", loaded);
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
