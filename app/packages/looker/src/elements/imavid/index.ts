/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import { getSampleSrc, getStandardizedUrls } from "@fiftyone/state";
import {
  BUFFERING_PAUSE_TIMEOUT,
  DEFAULT_FRAME_RATE,
  DEFAULT_PLAYBACK_RATE,
  LOOK_AHEAD_MULTIPLIER,
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
              disableOverlays: true,
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
  // adding a new state to track it because we want to compute it conditionally in renderSelf and not drawFrame
  private setTimeoutDelay = getMillisecondsFromPlaybackRate(this.playBackRate);
  private frameNumber = 1;
  private mediaField: string;
  private thumbnailSrc: string;
  /**
   * This frame number is the authoritaive frame number that is drawn on the canvas.
   * `frameNumber` or `currentFrameNumber`, on the other hand, are suggestive
   */
  private canvasFrameNumber: number;
  private isPlaying: boolean;
  private isSeeking: boolean;
  private waitingToPause = false;
  private isAnimationActive = false;

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
    const sample =
      this.framesController.store.getSampleAtFrame(currentFrameNumber);

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
  }

  pause(shouldUpdatePlaying = true) {
    this.isAnimationActive = false;
    if (shouldUpdatePlaying) {
      this.update(({ playing }) => {
        if (playing) {
          return { playing: false, disabled: false, disableOverlays: false };
        }
        return {};
      });
    }
    this.resetWaitingFlags();
    this.framesController.pauseFetch();
  }

  async resetCanvas() {
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
      skipAndTryAgain();
      return;
    }

    const currentFrameSample = this.getCurrentFrameSample(frameNumberToDraw);

    if (!currentFrameSample) {
      if (frameNumberToDraw < this.framesController.totalFrameCount) {
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

    this.canvasFrameNumber = frameNumberToDraw;
    image.addEventListener("load", () => {
      if (this.isPlaying || this.isSeeking) {
        this.ctx.drawImage(image, 0, 0);
      }

      // this is when frame number changed through methods like keyboard navigation
      if (!this.isPlaying && !this.isSeeking && !animate) {
        this.ctx.drawImage(image, 0, 0);
        this.update(() => ({ currentFrameNumber: frameNumberToDraw }));
      }

      if (animate && !this.waitingToPause) {
        if (frameNumberToDraw <= this.framesController.totalFrameCount) {
          this.update(({ playing }) => {
            if (playing) {
              return {
                currentFrameNumber: Math.min(
                  frameNumberToDraw,
                  this.framesController.totalFrameCount
                ),
              };
            }

            return {};
          });
        }

        setTimeout(() => {
          requestAnimationFrame(() => {
            const next = frameNumberToDraw + 1;

            if (next > this.framesController.totalFrameCount) {
              this.update(({ options: { loop } }) => {
                if (loop) {
                  this.drawFrame(1);
                  return {
                    playing: true,
                    disableOverlays: true,
                    currentFrameNumber: 1,
                  };
                }

                return {
                  playing: false,
                  disableOverlays: false,
                  currentFrameNumber: this.framesController.totalFrameCount,
                };
              });
              return;
            }

            this.drawFrame(next);
          });
        }, this.setTimeoutDelay);
      }
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
    if (typeof currentFrameNumber !== "number") {
      throw new Error("currentFrameNumber must be a number");
    }

    // 5000 is an arbitrary upper bound for the multiplier
    const frameCountMultiplierWeight =
      1 + Math.min(this.framesController.totalFrameCount / 5000, 1);

    const offset = this.isSeeking
      ? 2
      : DEFAULT_FRAME_RATE * LOOK_AHEAD_MULTIPLIER * frameCountMultiplierWeight;

    const frameRangeMax = Math.min(
      Math.trunc(currentFrameNumber + offset),
      this.framesController.totalFrameCount
    );

    return [currentFrameNumber, frameRangeMax] as const;
  }

  /**
   * Queue up frames to be fetched if necessary.
   * This method is not blocking, it merely enqueues a fetch job.
   */
  private ensureBuffers(state: Readonly<ImaVidState>) {
    if (!this.framesController.totalFrameCount) {
      return;
    }

    let shouldEnqueueFetch = false;
    const necessaryFrameRange = this.getLookAheadFrameRange(
      state.currentFrameNumber
    );

    if (necessaryFrameRange[1] < necessaryFrameRange[0]) {
      return;
    }

    const rangeAvailable =
      this.framesController.storeBufferManager.containsRange(
        necessaryFrameRange
      );

    if (rangeAvailable) {
      return;
    }

    if (state.config.thumbnail && state.hovering) {
      shouldEnqueueFetch = true;
    } else if (!state.config.thumbnail) {
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
      options: { playbackRate },
      config: { thumbnail, src: thumbnailSrc },
      currentFrameNumber,
      seeking,
      hovering,
      playing,
      loaded,
      destroyed,
    } = state;
    // todo: move this to `createHtmlElement` unless src is something that isn't stable between renders
    if (this.thumbnailSrc !== thumbnailSrc) {
      this.thumbnailSrc = thumbnailSrc;
      this.element.setAttribute("src", thumbnailSrc);
    }

    if (!loaded) {
      return;
    }

    this.isPlaying = playing;
    this.isSeeking = seeking;
    this.frameNumber = currentFrameNumber;

    if (this.playBackRate !== playbackRate) {
      this.playBackRate = playbackRate;
      this.setTimeoutDelay = getMillisecondsFromPlaybackRate(playbackRate);
    }

    // `destroyed` is called when looker is reset
    if (destroyed) {
      this.framesController.destroy();
    }

    this.ensureBuffers(state);

    if (!playing && this.isAnimationActive) {
      // this flag will be picked up in `drawFrame`, that in turn will call `pause`
      this.waitingToPause = true;
      this.isAnimationActive = false;
    }

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
      this.drawFrame(currentFrameNumber, false);
      this.isAnimationActive = false;
    }

    if (!playing && !seeking) {
      // check if current frame number is what has been drawn
      // if they're different, then draw the frame
      if (this.frameNumber !== this.canvasFrameNumber) {
        this.waitingToPause = false;
        this.drawFrame(this.frameNumber, false);
        this.isAnimationActive = false;
      }
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
