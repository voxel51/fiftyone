/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import { getSampleSrc, getStandardizedUrls } from "@fiftyone/state";
import {
  ANIMATION_CANCELED_ID,
  BUFFERING_PAUSE_TIMEOUT,
  DEFAULT_FRAME_RATE,
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
  private loop = false;
  private playBackRate = 1.3;
  // adding a new state to track it because we want to compute it conditionally in renderSelf and not drawFrame
  private setTimeoutDelay = getMillisecondsFromPlaybackRate(this.playBackRate);
  private frameNumber = 1;
  private animationId = ANIMATION_CANCELED_ID;
  private posterFrame: number;
  private mediaField: string;
  private requestCallback: (callback: (time: number) => void) => void;
  private release: () => void;
  private thumbnailSrc: string;
  private isBuffering: boolean;
  private waitingToPause = false;
  private waitingToPlay = false;
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
    this.waitingToPlay = false;
    this.waitingToRelease = false;
  }

  cancelAnimation() {
    cancelAnimationFrame(this.animationId);
    this.animationId = ANIMATION_CANCELED_ID;
  }

  pause(shouldUpdatePlaying = true) {
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
      this.pause();
      return;
    }

    const currentFrameSample = this.getCurrentFrameSample(currentFrameNumber);
    // TODO: CACHE EVERYTHING INSIDE HERE
    // TODO: create a cache of fetched images (with fetch priority) before starting drawFrame requestAnimation

    if (!currentFrameSample) {
      if (currentFrameNumber < this.framesController.totalFrameCount) {
        setTimeout(() => {
          this.animationId = requestAnimationFrame(
            this.drawFrame.bind(this, currentFrameNumber)
          );
        }, BUFFERING_PAUSE_TIMEOUT);
        return;
      } else {
        this.pause();
        return;
      }
    }

    this.waitingToPlay = true;

    const urls = getStandardizedUrls(currentFrameSample.urls);
    const src = getSampleSrc(urls[this.mediaField]);
    const image = new Image();
    image.addEventListener("load", () => {
      // thisSampleOverlayPrepared.then((overlay) => {
      this.ctx.drawImage(image, 0, 0);

      if (animate) {
        if (currentFrameNumber <= this.framesController.totalFrameCount) {
          this.update({ currentFrameNumber: currentFrameNumber + 1 });
        }

        setTimeout(() => {
          this.animationId = requestAnimationFrame(
            this.drawFrame.bind(this, currentFrameNumber + 1)
          );
        }, this.setTimeoutDelay);
      }
      // });
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
    // if (this.framesController.isFetching) {
    //   return;
    // }

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
    } else if (!state.config.thumbnail && state.playing && !state.seeking) {
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
    // else {
    //   this.framesController.pauseFetch();
    // }
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

    this.isBuffering = buffering;

    if (this.playBackRate !== playbackRate) {
      this.playBackRate = playbackRate;
      this.setTimeoutDelay = getMillisecondsFromPlaybackRate(playbackRate);
      const a = this.setTimeoutDelay;
    }

    this.batchUpdate(() => {
      // `destroyed` is called when looker is reset
      if (destroyed) {
        this.framesController.cleanup();
      }

      this.ensureBuffers(state);

      if (thumbnail) {
        if (!hovering) {
          if (!playing) {
            this.cancelAnimation();
            this.resetCanvas();

            if (
              this.animationId === ANIMATION_CANCELED_ID &&
              currentFrameNumber !== 1
            ) {
              this.update({ currentFrameNumber: 1 });
            }
          }

          this.framesController.cleanup();
        } else if (hovering && playing) {
          // this.waitingToPause = false;
          // this.waitingToPlay = true;
          this.play(currentFrameNumber);
        }
      }

      if (!playing && this.animationId !== ANIMATION_CANCELED_ID) {
        this.waitingToPause = true;
      }

      if (thumbnail) {
        return;
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

export * from "./frame-count";
export * from "./loader-bar";
export * from "./play-button";
export * from "./playback-rate";
export * from "./seek-bar";
export * from "./seek-bar-thumb";
