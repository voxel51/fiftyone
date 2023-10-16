/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import { ImaVidState, Optional, StateUpdate } from "../../state";
import { BaseElement, Events } from "../base";
import { getFrameNumber } from "../util";
import { PlaybackRateBarElement } from "./playback-rate-bar";
import { PlaybackRateContainerElement } from "./playback-rate-container";
import { PlaybackRateIconElement } from "./playback-rate-icon";

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
              frameNumber: 1,
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
      frameNumber,
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
  private requestCallback: (callback: (time: number) => void) => void;
  private release: () => void;
  private src: string;
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

  // private acquireVideo() {
  //   let called = false;

  //   this.update(({ waitingForVideo, error }) => {
  //     if (!waitingForVideo && !error) {
  //       acquirePlayer().then(([video, release]) => {
  //         this.update(
  //           ({ frameNumber, hovering, config: { frameRate, thumbnail } }) => {
  //             this.element = video;
  //             this.release = release;
  //             if ((!hovering && thumbnail) || this.waitingToRelease) {
  //               this.releaseVideo();
  //             } else {
  //               this.attachEvents();
  //               this.frameNumber = getTime(frameNumber, frameRate);
  //               this.element.currentTime = getTime(frameNumber, frameRate);
  //               this.element.src = this.src;
  //             }

  //             return {};
  //           }
  //         );
  //       });

  //       called = true;

  //       return { waitingForVideo: true };
  //     }

  //     return {};
  //   });

  //   return called;
  // }

  // private releaseVideo() {
  //   if (this.waitingToPause || this.waitingToPlay || !this.element) {
  //     this.waitingToRelease = true;
  //     this.imageSource = this.canvas;
  //     this.canvas &&
  //       this.update(({ waitingForVideo }) =>
  //         waitingForVideo ? { waitingForVideo: false } : {}
  //       );
  //     return;
  //   }

  //   !this.element.paused && this.element.pause();

  //   this.waitingToRelease = false;

  //   this.removeEvents();
  //   this.element = null;
  //   this.release && this.release();
  //   this.release = null;

  //   this.update({
  //     waitingForVideo: false,
  //     frameNumber: this.posterFrame,
  //     playing: false,
  //   });
  // }

  pause() {
    console.log("Pausing");
  }

  async play() {
    this.update((state) => {
      if (state.config.framesController.store.frames.length === 0) {
        state.config.framesController;
      }
      return { ...state };
    });
  }

  // sashank
  renderSelf({
    options: { loop, playbackRate },
    config: { frameRate, thumbnail, src: thumbnailSrc },
    frameNumber,
    seeking,
    playing,
    loaded,
    buffering,
    hovering,
    hasPoster,
    destroyed,
  }: Readonly<ImaVidState>) {
    // thumbnailSrc = source of first frame of the dynamic group
    if (this.src !== thumbnailSrc) {
      this.src = thumbnailSrc;
      this.element.setAttribute("src", thumbnailSrc);
    }

    if (destroyed) {
      // triggered when, for example, grid is reset, do nothing
      // this.releaseVideo();
    }

    if (thumbnail) {
      if (hovering) {
        this.play();
        return;
      } else {
        this.pause();
        return;
      }
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

    if (this.playbackRate !== playbackRate) {
      // this.element.playbackRate = playbackRate;
      this.playbackRate = playbackRate;
    }

    if (this.frameNumber !== frameNumber) {
      // this.element.currentTime = getTime(frameNumber, frameRate);
      this.frameNumber = frameNumber;
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
