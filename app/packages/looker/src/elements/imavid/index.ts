/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import { getSampleSrc, getStandardizedUrls } from "@fiftyone/state";
import {
  ANIMATION_CANCELED_ID,
  DEFAULT_FRAME_RATE,
  LOOK_AHEAD_TIME_SECONDS,
} from "../../lookers/imavid/constants";
import { ImaVidFramesController } from "../../lookers/imavid/controller";
import { DispatchEvent, ImaVidState } from "../../state";
import { BaseElement, Events } from "../base";
import { getMillisecondsFromPlaybackRate } from "../../util";

export function withImaVidLookerEvents(): () => Events<ImaVidState> {
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
  { seeking, config: { frameStoreController } }: Readonly<ImaVidState>,
  event: MouseEvent
): Partial<ImaVidState> => {
  const totalFramesCount = frameStoreController.totalFrameCount;

  if (totalFramesCount > 0 && seeking) {
    const element = event.currentTarget as HTMLDivElement;
    const { width, left } = element.getBoundingClientRect();

    const frameNumber = Math.min(
      Math.max(
        1,
        Math.round(((event.clientX + 6 - left) / width) * totalFramesCount)
      ),
      totalFramesCount
    );

    return {
      currentFrameNumber: frameNumber,
    };
  }
  return {};
};

export class ImaVidElement extends BaseElement<ImaVidState, HTMLImageElement> {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private loop = false;
  private playBackRate = 1.1;
  // adding a new state to track it because we want to compute it conditionally in renderSelf and not drawFrame
  private setTimeoutDelay = getMillisecondsFromPlaybackRate(this.playBackRate);
  private frameNumber = 1;
  private animationId = ANIMATION_CANCELED_ID;
  private posterFrame: number;
  private mediaField: string;
  private framesController: ImaVidFramesController;
  private requestCallback: (callback: (time: number) => void) => void;
  private release: () => void;
  private thumbnailSrc: string;
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

        this.ctx = this.canvas.getContext("2d");
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(this.element, 0, 0);

        this.imageSource = this.canvas;

        this.update({
          // todo: this loaded doesn't have much meaning, remove it
          loaded: true,
          // note: working assumption =  all images in this "video" are of the same width and height
          // this might be an incorrect assumption for certain use cases
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
  createHTMLElement(dispatchEvent: DispatchEvent) {
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
        this.framesController.setImaVidStateUpdater(this.update);
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

    return this.element;
  }

  private getCurrentFrameSample(currentFrameNumber: number) {
    const samples = this.framesController.store.samples;
    const indices = this.framesController.store.frameIndex;

    const sampleIndex = indices.get(currentFrameNumber);
    const sample = samples.get(sampleIndex);

    if (!sample) {
      return null;
    }

    if (sample.__typename !== "ImageSample") {
      throw new Error("expected an image sample");
    }

    return sample;
  }

  resetWaitingFlags() {
    this.waitingToPause = false;
    this.waitingToPlay = false;
    this.waitingToRelease = false;
  }

  cancelAnimation() {
    cancelAnimationFrame(this.animationId);
    this.animationId = ANIMATION_CANCELED_ID;
  }

  pause(shouldUpdatePlaying = true) {
    console.log("pausing");
    this.waitingToPause = true;

    // "yield" so that requestAnimation gets to react to waitingToPause
    setTimeout(() => {
      this.cancelAnimation();
      if (shouldUpdatePlaying) {
        this.update({ playing: false });
      }
    }, 0);
    this.resetWaitingFlags();
  }

  async resetCanvas() {
    setTimeout(() => this.ctx.drawImage(this.element, 0, 0), 0);
  }

  async drawFrame(currentFrameNumber: number, animate = true) {
    if (this.waitingToPause) {
      this.cancelAnimation();
      return;
    }

    const currentFrameSample = this.getCurrentFrameSample(currentFrameNumber);
    // TODO: CACHE EVERYTHING INSIDE HERE
    // TODO: create a cache of fetched images (with fetch priority) before starting drawFrame requestAnimation

    if (!currentFrameSample) {
      console.log("no current sample, ", currentFrameNumber);
      this.pause();
      return;
    }

    this.waitingToPlay = true;

    const urls = getStandardizedUrls(currentFrameSample.urls);
    const src = getSampleSrc(urls[this.mediaField]);
    const image = new Image();
    image.addEventListener("load", () => {
      this.ctx.drawImage(image, 0, 0);

      if (animate) {
        this.update({ currentFrameNumber: currentFrameNumber + 1 });

        setTimeout(() => {
          this.animationId = requestAnimationFrame(
            this.drawFrame.bind(this, currentFrameNumber + 1)
          );
        }, this.setTimeoutDelay);
      }
    });
    image.src = src;
  }

  /**
   * This method does the following:
   * 1. Check if we have next 100 frames from current framestamp in store
   * 2. If not, fetch next FPS * 5 frames (5 seconds of playback with 24 fps (max offered))
   */
  async play(currentFrameNumber: number) {
    if (this.animationId !== ANIMATION_CANCELED_ID) {
      // animation is active, return
      return;
    }

    this.animationId = requestAnimationFrame(
      this.drawFrame.bind(this, currentFrameNumber)
    );
  }

  private getNecessaryFrameRange(currentFrameNumber: number) {
    const frameRangeMax =
      currentFrameNumber +
      LOOK_AHEAD_TIME_SECONDS * this.framesController.currentFrameRate;
    return [currentFrameNumber, frameRangeMax] as const;
  }

  /**
   * Queue up frames to be fetched if necessary.
   * This method is not blocking, it merely enqueues a fetch job.
   */
  private ensureBuffers(state: Readonly<ImaVidState>) {
    if (this.framesController.isFetching) {
      return;
    }

    let shouldBuffer = false;
    const necessaryFrameRange = this.getNecessaryFrameRange(
      state.currentFrameNumber
    );
    const rangeAvailable =
      this.framesController.storeBufferManager.containsRange(
        necessaryFrameRange
      );

    if (state.config.thumbnail && state.hovering && !rangeAvailable) {
      // for grid
      // only buffer if hovering and range not available
      shouldBuffer = true;
    } else if (
      !state.config.thumbnail &&
      state.playing &&
      !state.seeking &&
      !rangeAvailable
    ) {
      // for modal
      shouldBuffer = true;
    }

    if (shouldBuffer) {
      const unprocessedBufferRange =
        this.framesController.storeBufferManager.getUnprocessedBufferRange(
          necessaryFrameRange
        );
      this.framesController.enqueueFetch(unprocessedBufferRange);
      this.framesController.resumeFetch();
    } else {
      this.framesController.pauseFetch();
    }
  }

  renderSelf(state: Readonly<ImaVidState>) {
    const {
      options: { loop, playbackRate },
      config: { thumbnail, src: thumbnailSrc },
      currentFrameNumber,
      seeking,
      hovering,
      playing,
      bufferManager,
      loaded,
      buffering,
      destroyed,
    } = state;
    console.log(
      "render self",
      currentFrameNumber,
      "playing",
      playing,
      "buffering",
      buffering,
      "seeking",
      seeking
    );

    // todo: move this to `createHtmlElement` unless src is something that isn't stable between renders
    if (this.thumbnailSrc !== thumbnailSrc) {
      this.thumbnailSrc = thumbnailSrc;
      this.element.setAttribute("src", thumbnailSrc);
    }

    if (this.playBackRate !== playbackRate) {
      this.playBackRate = playbackRate;
      this.setTimeoutDelay = getMillisecondsFromPlaybackRate(playbackRate);
      const a = this.setTimeoutDelay;
      console.log("delay is ", a);
    }

    this.batchUpdate(() => {
      // `destroyed` is called when looker is reset
      if (destroyed) {
        this.framesController.cleanup();
      }

      this.ensureBuffers(state);

      const isPlayable =
        this.getCurrentFrameSample(currentFrameNumber) !== null;

      if (!isPlayable) {
        return;
      }

      if (thumbnail) {
        if (!hovering) {
          if (currentFrameNumber === 1 || !playing) {
            this.pause(false);
            this.resetCanvas();
          }

          this.framesController.cleanup();
        } else if (hovering && playing) {
          this.waitingToPause = false;
          this.waitingToPlay = true;
          this.play(currentFrameNumber);
        }
      }

      if (!playing && this.animationId !== ANIMATION_CANCELED_ID) {
        this.waitingToPause = true;
      }

      if (playing && !seeking && !buffering) {
        this.play(currentFrameNumber);
      }

      if (playing && seeking) {
        this.pause();
        this.drawFrame(currentFrameNumber, false);
      }

      if (!playing && seeking) {
        this.drawFrame(currentFrameNumber, false);
      }

      return null;

      if (this.loop !== loop) {
        // this.element.loop = loop;
        this.loop = loop;
      }

      return null;
    });

    return null;
  }
}

export * from "./loader-bar";
export * from "./play-button";
export * from "./playback-rate";
export * from "./seek-bar";
export * from "./seek-bar-thumb";
export * from "./frame-count";
