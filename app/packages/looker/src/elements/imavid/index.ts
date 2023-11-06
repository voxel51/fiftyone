/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import { getSampleSrc, getStandardizedUrls } from "@fiftyone/state";
import { LOOK_AHEAD_TIME_SECONDS } from "../../lookers/imavid/constants";
import { ImaVidFramesController } from "../../lookers/imavid/controller";
import { DispatchEvent, ImaVidState } from "../../state";
import { BaseElement, Events } from "../base";
import { PlaybackRateBarElement } from "./playback-rate-bar";
import { PlaybackRateContainerElement } from "./playback-rate-container";
import { PlaybackRateIconElement } from "./playback-rate-icon";

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
  { seeking, config: { frameRate } }: Readonly<ImaVidState>,
  event: MouseEvent
): Partial<ImaVidState> => {
  // if (duration && seeking) {
  //   const element = event.currentTarget as HTMLDivElement;
  //   const { width, left } = element.getBoundingClientRect();
  //   const frameCount = getFrameNumber(duration, duration, frameRate);

  //   const frameNumber = Math.min(
  //     Math.max(
  //       1,
  //       Math.round(((event.clientX + 6 - left) / width) * frameCount)
  //     ),
  //     frameCount
  //   );

  //   return {
  //     currentFrameNumber: frameNumber,
  //   };
  // }
  return {};
};

export class ImaVidElement extends BaseElement<ImaVidState, HTMLImageElement> {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private loop = false;
  private playbackRate = 1;
  private frameNumber = 1;
  private animationId = -1;
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

    // this.requestCallback = (callback: (time: number) => void) => {
    //   requestAnimationFrame(() => {
    //     this.element && callback(this.frameNumber);
    //   });
    // };

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

  async drawFrame(currentFrameNumber: number, animate = true) {
    if (this.waitingToPause) {
      console.log("waiting to pause in drawframe");
      return;
    }

    const currentFrameSample = this.getCurrentFrameSample(currentFrameNumber);
    // TODO: CACHE EVERYTHING INSIDE HERE
    // TODO: create a cache of fetched images (with fetch priority) before starting drawFrame requestAnimation

    if (!currentFrameSample) {
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

        this.animationId = requestAnimationFrame(
          this.drawFrame.bind(this, currentFrameNumber + 1)
        );
      }
    });
    image.src = src;
  }

  pause() {
    console.log("pausing");
    this.waitingToPause = true;
    this.update({ playing: false });
    cancelAnimationFrame(this.animationId);
    this.waitingToPause = false;
    this.waitingToPlay = false;
  }

  /**
   * This method does the following:
   * 1. Check if we have next 100 frames from current framestamp in store
   * 2. If not, fetch next FPS * 5 frames (5 seconds of playback with 24 fps (max offered))
   */
  async play(currentFrameNumber: number) {
    if (this.waitingToPlay || this.waitingToPause) {
      return;
    }

    console.log("invoking drawFrame");

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
      options: { loop },
      config: { frameRate, thumbnail, src: thumbnailSrc },
      currentFrameNumber,
      seeking,
      hovering,
      playing,
      bufferManager,
      isCurrentFrameNumberAuthoritative,
      loaded,
      buffering,
      destroyed,
    } = state;
    // todo: move this to `createHtmlElement` unless src is something that isn't stable between renders
    if (this.thumbnailSrc !== thumbnailSrc) {
      this.thumbnailSrc = thumbnailSrc;
      this.element.setAttribute("src", thumbnailSrc);
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
        return null;
      }

      if (thumbnail && !hovering) {
        this.framesController.cleanup();
        this.waitingToPlay = false;

        if (!playing && !this.waitingToPause) {
          this.drawFrame(1, false);
          this.waitingToPause = true;
        }
      } else if (thumbnail && hovering && playing) {
        this.waitingToPause = false;
        this.play(currentFrameNumber);
      }
      // if (loaded && playing && !seeking && !buffering) {
      //   this.play();
      //   return null;
      // }

      return null;

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
    });

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
