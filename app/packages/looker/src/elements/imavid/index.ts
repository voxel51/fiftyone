/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import { getSampleSrc, getStandardizedUrls } from "@fiftyone/state";
import { ImaVidFramesController } from "../../lookers/imavid/controller";
import { ImaVidState, Optional, StateUpdate } from "../../state";
import { BaseElement, Events } from "../base";
import { getFrameNumber } from "../util";
import { PlaybackRateBarElement } from "./playback-rate-bar";
import { PlaybackRateContainerElement } from "./playback-rate-container";
import { PlaybackRateIconElement } from "./playback-rate-icon";
import { LOOK_AHEAD_TIME_SECONDS } from "../../lookers/imavid/constants";

export function withVideoLookerEvents(): () => Events<ImaVidState> {
  return function () {
    return {
      mouseenter: ({ update }) => {
        update(({ config: { thumbnail } }) => {
          if (thumbnail) {
            return {
              playing: true,
            };
          }
          return {};
        });
      },
      mouseleave: ({ update }) => {
        update(({ config: { thumbnail } }) => {
          if (thumbnail) {
            return {
              currentFrameNumber: 1,
              playing: false,
            };
          }
          return {
            seeking: false,
            seekBarHovering: false,
          };
        });
      },
      mousemove: ({ event, update }) => {
        update((state) => seekFn(state, event));
      },
      mouseup: ({ event, update }) => {
        update((state) => ({ ...seekFn(state, event), seeking: false }));
      },
    };
  };
}

const seekFn = (
  { seeking, duration, config: { frameRate } }: Readonly<ImaVidState>,
  event: MouseEvent
): Optional<ImaVidState> => {
  if (duration && seeking) {
    const element = event.currentTarget as HTMLDivElement;
    const { width, left } = element.getBoundingClientRect();
    const frameCount = getFrameNumber(duration, duration, frameRate);

    const frameNumber = Math.min(
      Math.max(
        1,
        Math.round(((event.clientX + 6 - left) / width) * frameCount)
      ),
      frameCount
    );

    return {
      currentFrameNumber: frameNumber,
    };
  }
  return {};
};

export class ImaVidElement extends BaseElement<ImaVidState, HTMLImageElement> {
  private canvas: HTMLCanvasElement;
  private frameNumber: number;
  private loop = false;
  private playbackRate = 1;
  private posterFrame: number;
  private mediaField: string;
  private framesController: ImaVidFramesController;
  private requestCallback: (callback: (time: number) => void) => void;
  private release: () => void;
  private thumbnailSrc: string;
  private update: StateUpdate<ImaVidState>;
  // private dispatchEvent:
  private waitingToPause = false;
  private waitingToPlay = false;
  private waitingToRelease = false;

  imageSource: HTMLCanvasElement | HTMLImageElement;

  getEvents(): Events<ImaVidState> {
    return {
      load: () => {
        // assign value for looker's canvas
        this.canvas = document.createElement("canvas");
        this.canvas.style.imageRendering = "pixelated";
        this.canvas.width = this.element.naturalWidth;
        this.canvas.height = this.element.naturalHeight;

        const ctx = this.canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.element, 0, 0);

        this.imageSource = this.canvas;

        this.update({
          loaded: true,
          dimensions: [this.element.naturalWidth, this.element.naturalHeight],
        });
      },
      error: (e) => {
        e.update({ error: true });
      },
    };
  }

  /**
   * Create the relevant html element so that this.imagesource is set
   *
   * in image looker:
   *  - it is an HTMLImageElement
   *
   * in video looker:
   * - if thumbnail, it is canvas for grid view, html video otherwise (modal)
   * - thumbnailer:
   */
  createHTMLElement(update: StateUpdate<ImaVidState>, dispatchEvent) {
    this.update = update;

    // not really doing an update, just updating refs
    this.update(
      ({
        config: {
          mediaField,
          frameRate,
          frameStoreController: framesController,
        },
      }) => {
        this.framesController = framesController;
        this.mediaField = mediaField;

        this.framesController.setFrameRate(frameRate);

        return {};
      }
    );

    this.element = new Image();
    this.element.crossOrigin = "Anonymous";
    this.element.loading = "eager";

    this.element.addEventListener("load", () => {
      dispatchEvent("load");
    });

    // this.requestCallback = (callback: (time: number) => void) => {
    //   requestAnimationFrame(() => {
    //     this.element && callback(this.frameNumber);
    //   });
    // };

    return this.element;
  }

  pause() {
    this.waitingToPause = true;
    console.log("Pausing");
    this.frameNumber = 1;
    this.update({ playing: false });
    this.waitingToPause = false;
    this.waitingToPlay = false;
  }

  async buffer() {
    this.update({ buffering: true });

    if (!this.framesController.isHydrated()) {
      await this.framesController.hydrateIfEmpty();
    }

    this.update({ buffering: false });
  }

  async drawFrame() {
    if (this.waitingToPause) {
      return;
    }

    const samples = this.framesController.store.samples;
    const indices = this.framesController.store.frameIndex;

    if (samples.length === 0 || !indices.has(this.frameNumber)) {
      // todo: buffer and resume
      // todo: store max frames available for this dynamic group
      console.log("no more frames. finishing playback.");
      return;
    }

    const sample = samples.get(indices.get(this.frameNumber));

    if (!sample) {
      alert("missing sample");
      return;
    }

    if (sample.__typename !== "ImageSample") {
      alert("not an image sample");
      return;
    }

    const urls = getStandardizedUrls(sample.urls);
    const src = getSampleSrc(urls[this.mediaField]);
    const image = new Image();
    image.addEventListener("load", () => {
      const ctx = this.canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      requestAnimationFrame(this.drawFrame.bind(this));
    });
    image.src = src;
    this.frameNumber += 1;
    requestAnimationFrame(this.drawFrame.bind(this));
  }

  /**
   * This method does the following:
   * 1. Check if we have next 100 frames from current framestamp in store
   * 2. If not, fetch next FPS * 5 frames (5 seconds of playback with 24 fps (max offered))
   */
  async play() {
    // if (this.waitingToPlay || this.waitingToPause) {
    //   return;
    // }
    // see if we can do without waitingTo__ flags unlike video looker
    // this.waitingToPlay = true;

    this.buffer().then(() => {
      this.update({ playing: true });
      requestAnimationFrame(this.drawFrame.bind(this));
    });
  }

  private getNecessaryFrameRange() {}

  /**
   * Check if current framestamp is in store with frames enough for
   * [`LOOK_AHEAD_TIME_SECONDS`](../../lookers/imavid/constants.ts) given current frame rate
   */
  private shouldBuffer(currentFrameNumber: number, frameRate: number) {
    const maxFrame = currentFrameNumber + LOOK_AHEAD_TIME_SECONDS * frameRate;
    for (let i = currentFrameNumber; i < maxFrame; i++) {
      if (!this.framesController.store.frameIndex.has(i)) {
        return true;
      }
    }
    return false;
  }

  renderSelf(options: Readonly<ImaVidState>) {
    const {
      options: { loop },
      config: { frameRate, thumbnail, src: thumbnailSrc },
      currentFrameNumber,
      seeking,
      playing,
      loaded,
      buffering,
      destroyed,
    } = options;

    // todo: move this to `createHtmlElement` unless src is something that isn't stable between renders
    if (this.thumbnailSrc !== thumbnailSrc) {
      this.thumbnailSrc = thumbnailSrc;
      this.element.setAttribute("src", thumbnailSrc);
    }

    if (destroyed) {
      // triggered when, for example, grid is reset, do nothing
      // this.releaseVideo();
    }

    // check if we need to buffer
    if (
      loaded &&
      !buffering &&
      !seeking &&
      this.shouldBuffer(currentFrameNumber, frameRate)
    ) {
      this.buffer();
    }

    // now that we know we have some frames, we can begin streaming

    if (loaded && playing && !seeking && !buffering) {
      this.play();
    }

    this.imageSource = this.canvas;
    // if (hasPoster && frameNumber === this.posterFrame) {
    //   console.log("setting canvas as source");
    //   this.imageSource = this.canvas;
    // } else {
    //   console.log("setting element as source");
    //   this.imageSource = this.element;
    // }

    if (!this.element) {
      return null;
    }

    // if (loaded && playing && !seeking && !buffering && this.element.paused) {
    //   this.waitingToPlay = true;
    //   this.element.play().then(() => {
    //     this.waitingToPlay = false;
    //     this.waitingToPause && this.element && this.element.pause();
    //     this.waitingToPause = false;

    //     if (this.waitingToRelease) {
    //       this.releaseVideo();
    //       return null;
    //     }
    //   });
    // }
    if (loaded && (!playing || seeking || buffering)) {
      if (!this.waitingToPlay) {
        this.pause();
      } else {
        this.waitingToPause = true;
      }
    }

    if (this.loop !== loop) {
      // this.element.loop = loop;
      this.loop = loop;
    }

    return null;
  }
}

export const PLAYBACK_RATE = {
  node: PlaybackRateContainerElement,
  children: [
    { node: PlaybackRateIconElement },
    { node: PlaybackRateBarElement },
  ],
};

export * from "./loader-bar";
export * from "./play-button";
export * from "./playback-rate-bar";
export * from "./playback-rate-container";
export * from "./playback-rate-icon";
export * from "./seek-bar";
export * from "./seek-bar-thumb";
export * from "./time";
