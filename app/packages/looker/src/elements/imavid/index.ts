/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import { getSampleSrc, getStandardizedUrls } from "@fiftyone/state";
import {
  BUFFERING_PAUSE_TIMEOUT,
  DEFAULT_FRAME_RATE,
  DEFAULT_PLAYBACK_RATE,
  LOOK_AHEAD_TIME_SECONDS,
} from "../../lookers/imavid/constants";
import { ImaVidFramesController } from "../../lookers/imavid/controller";
import { DispatchEvent, ImaVidState } from "../../state";
import { getMillisecondsFromPlaybackRate } from "../../util";
import { BaseElement, Events } from "../base";

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
  private playBackRate = DEFAULT_PLAYBACK_RATE;
  private loop = false;
  // adding a new state to track it because we want to compute it conditionally in renderSelf and not drawFrame
  private setTimeoutDelay = getMillisecondsFromPlaybackRate(this.playBackRate);
  private frameNumber = 1;
  private posterFrame: number;
  private mediaField: string;
  private requestCallback: (callback: (time: number) => void) => void;
  private release: () => void;
  private thumbnailSrc: string;
  private isBuffering: boolean;
  private isPlaying: boolean;
  private waitingToPause = false;
  private isAnimationActive = false;
  private waitingToRelease = false;

  public framesController: ImaVidFramesController;

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
    this.waitingToRelease = false;
  }

  pause(shouldUpdatePlaying = true) {
    this.isAnimationActive = false;
    if (shouldUpdatePlaying) {
      this.update(({ playing }) => {
        if (playing) {
          return { playing: false };
        }
        return {};
      });
    }
    this.resetWaitingFlags();
    this.framesController.pauseFetch();
  }

  async resetCanvas() {
    console.log("resetting canvas");
    this.ctx?.drawImage(this.element, 0, 0);
  }

  async drawFrame(frameNumberToDraw: number, animate = true) {
    if (this.waitingToPause) {
      this.pause();
      return;
    }

    const skipAndTryAgain = () =>
      setTimeout(() => {
        requestAnimationFrame(() => this.drawFrame(frameNumberToDraw));
      }, BUFFERING_PAUSE_TIMEOUT);

    if (!this.isPlaying && animate) {
      return;
    }

    this.isAnimationActive = animate;

    // if abs(frameNumberToDraw, currentFrameNumber) > 1, then skip
    // this is to avoid drawing frames that are too far apart
    // this can happen when user is scrubbing through the video
    if (Math.abs(frameNumberToDraw - this.frameNumber) > 1) {
      console.log(
        "skipping frame",
        frameNumberToDraw,
        "current",
        this.frameNumber
      );
      skipAndTryAgain();
      return;
    }

    const currentFrameSample = this.getCurrentFrameSample(frameNumberToDraw);
    // TODO: CACHE EVERYTHING INSIDE HERE
    // TODO: create a cache of fetched images (with fetch priority) before starting drawFrame requestAnimation

    if (!currentFrameSample) {
      if (frameNumberToDraw < this.framesController.totalFrameCount) {
        console.log(
          "waiting for frame ",
          frameNumberToDraw,
          " to be available to draw"
        );
        skipAndTryAgain();
        return;
      } else {
        this.pause(true);
        return;
      }
    }

    const urls = getStandardizedUrls(currentFrameSample.urls);
    const src = getSampleSrc(urls[this.mediaField]);
    const image = new Image();

    image.addEventListener("load", () => {
      // thisSampleOverlayPrepared.then((overlay) => {
      this.ctx.drawImage(image, 0, 0);

      if (animate && !this.waitingToPause) {
        if (frameNumberToDraw <= this.framesController.totalFrameCount) {
          this.update(({ playing }) => {
            if (playing) {
              return { currentFrameNumber: frameNumberToDraw + 1 };
            }

            return {};
          });
        }

        setTimeout(() => {
          requestAnimationFrame(() => this.drawFrame(frameNumberToDraw + 1));
        }, this.setTimeoutDelay);
      }
      // });
    });
    image.src = src;
  }

  async play() {
    if (this.isAnimationActive) {
      return;
    }

    requestAnimationFrame(() => this.drawFrame(this.frameNumber));
  }

  private getLookAheadFrameRange(currentFrameNumber: number) {
    const frameRangeMax = Math.min(
      currentFrameNumber +
        LOOK_AHEAD_TIME_SECONDS * this.playBackRate * DEFAULT_FRAME_RATE,
      this.framesController.totalFrameCount
    );

    return [currentFrameNumber, frameRangeMax] as const;
  }

  /**
   * Queue up frames to be fetched if necessary.
   * This method is not blocking, it merely enqueues a fetch job.
   */
  private ensureBuffers(state: Readonly<ImaVidState>) {
    let shouldEnqueueFetch = false;
    const necessaryFrameRange = this.getLookAheadFrameRange(
      state.currentFrameNumber
    );
    const rangeAvailable =
      this.framesController.storeBufferManager.containsRange(
        necessaryFrameRange
      );

    if (rangeAvailable) {
      return;
    }

    if (state.config.thumbnail && state.hovering) {
      // for grid
      // only buffer if hovering and range not available
      shouldEnqueueFetch = true;
      // todo: might want to buffer even when playing is false
    } else if (!state.config.thumbnail) {
      // for modal
      shouldEnqueueFetch = true;
    }

    if (shouldEnqueueFetch) {
      const unprocessedBufferRange =
        this.framesController.fetchBufferManager.getUnprocessedBufferRange(
          this.framesController.storeBufferManager.getUnprocessedBufferRange(
            necessaryFrameRange
          )
        );

      if (unprocessedBufferRange) {
        this.framesController.enqueueFetch(unprocessedBufferRange);
        this.framesController.resumeFetch();
      }
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

    if (!loaded) {
      return;
    }

    this.isBuffering = buffering;
    this.isPlaying = playing;
    this.frameNumber = currentFrameNumber;

    if (this.playBackRate !== playbackRate) {
      this.playBackRate = playbackRate;
      this.setTimeoutDelay = getMillisecondsFromPlaybackRate(playbackRate);
    }

    // `destroyed` is called when looker is reset
    if (destroyed) {
      this.framesController.pauseFetch();
    }

    this.ensureBuffers(state);

    if (!playing && this.isAnimationActive) {
      // this flag will be picked up in `drawFrame`, that in turn will call `pause`
      this.waitingToPause = true;
      this.isAnimationActive = false;
    }
    console.log(
      "isAnimationActive",
      this.isAnimationActive,
      "waitingToPause",
      this.waitingToPause
    );

    if (thumbnail) {
      if (!hovering) {
        if (!playing) {
          if (currentFrameNumber === 1) {
            this.resetCanvas();
            this.resetWaitingFlags();
          }
          if (currentFrameNumber !== 1) {
            this.update({ currentFrameNumber: 1 });
          }
          console.log("frame number is ", currentFrameNumber);
        }
      } else if (hovering && playing) {
        this.play();
      }
      return;
    }

    if (playing && !seeking) {
      this.play();
    }

    if (playing && seeking) {
      this.waitingToPause = true;
      this.isAnimationActive = false;
    }

    if (!playing && seeking) {
      this.waitingToPause = false;
      // todo: need to subtract 1 here to get the correct frame, figure out why
      this.drawFrame(currentFrameNumber - 1, false);
      this.isAnimationActive = false;
    }

    return null;
  }
}

export * from "./frame-count";
export * from "./loader-bar";
export * from "./play-button";
export * from "./playback-rate";
export * from "./seek-bar";
export * from "./seek-bar-thumb";
