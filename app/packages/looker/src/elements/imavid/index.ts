/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  BUFFERING_PAUSE_TIMEOUT,
  DEFAULT_PLAYBACK_RATE,
  HOVER_FETCH_INTENT_MS,
  INITIAL_LOOK_AHEAD_FRAMES,
  LOOK_AHEAD_MULTIPLIER,
  STREAM_BATCH_FRAMES,
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
            // scroll-induced enter isn't a deliberate hover; wait for a real mousemove.
            return {
              playing: true,
              disableOverlays: true,
              hoverProbed: false,
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
              hoverProbed: false,
            };
          }
          return {
            seeking: false,
            seekBarHovering: false,
          };
        });
      },
      mousemove: ({ event, update }) => {
        update((state) => {
          // a real pointer move = deliberate hover, which unlocks the stream fetch.
          const probe = state.config.thumbnail ? { hoverProbed: true } : {};
          return { ...seekFn(state, event), ...probe };
        });
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
  private frameNumber = 1;
  private setTimeoutDelay: number;
  private targetFrameRate: number;
  private isThumbnail: boolean;
  private thumbnailSrc: string;
  /**
   * This frame number is the authoritaive frame number that is drawn on the canvas.
   * `frameNumber` or `currentFrameNumber`, on the other hand, are suggestive
   */
  private canvasFrameNumber: number;
  private isPlaying: boolean;
  private isSeeking: boolean;
  private isLoop: boolean;
  private waitingToPause = false;
  private isAnimationActive = false;
  // pending sustained-hover timer before a thumbnail's first stream fetch starts
  private hoverFetchTimer?: number;

  public framesController: ImaVidFramesController;

  imageSource: HTMLCanvasElement | HTMLImageElement;

  getEvents(): Events<ImaVidState> {
    return {
      load: () => {
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
          // assumes all frames share one width/height.
          dimensions: [this.element.naturalWidth, this.element.naturalHeight],
        });
      },
      error: (e) => {
        e.update({ error: true });
      },
    };
  }

  /** Create the html element so that this.imageSource is set. */
  createHTMLElement(dispatchEvent: DispatchEvent) {
    // not an update, just updating refs.
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

        this.framesController.setFrameRate(frameRate);
        this.framesController.setMediaField(mediaField);

        return {};
      }
    );

    this.element = new Image();
    this.element.loading = "eager";

    this.element.addEventListener("load", () => {
      dispatchEvent("load");
    });

    return this.element;
  }

  private getCurrentFrameImage(currentFrameNumber: number) {
    const sample =
      this.framesController.store.getSampleAtFrame(currentFrameNumber);

    if (!sample) {
      return null;
    }

    return sample.image ?? null;
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
    this.cancelHoverFetch();
    this.framesController.pauseFetch();
  }

  async resetCanvas() {
    this.ctx?.drawImage(this.element, 0, 0);
  }

  paintImageOnCanvas(image: HTMLImageElement) {
    this.ctx?.setTransform(1, 0, 0, 1, 0, 0);

    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx?.drawImage(image, 0, 0);
  }

  async skipAndTryAgain(frameNumberToDraw: number, animate: boolean) {
    setTimeout(() => {
      requestAnimationFrame(() => {
        if (animate) {
          return this.drawFrame(frameNumberToDraw);
        }
        return this.drawFrameNoAnimation(frameNumberToDraw);
      });
    }, BUFFERING_PAUSE_TIMEOUT);
  }

  async drawFrameNoAnimation(frameNumberToDraw: number) {
    let image = this.getCurrentFrameImage(frameNumberToDraw);

    // block until the frame is drawable; the modal timeline gates its playhead on this.
    while (!image) {
      const total = this.framesController.totalFrameCount;
      // past the known end → nothing to draw (don't hang).
      if (total != null && frameNumberToDraw > total) {
        return;
      }
      this.checkFetchBufferManager();
      await new Promise((resolve) =>
        setTimeout(resolve, BUFFERING_PAUSE_TIMEOUT)
      );
      image = this.getCurrentFrameImage(frameNumberToDraw);
    }

    this.paintImageOnCanvas(image);

    this.update(() => ({ currentFrameNumber: frameNumberToDraw }));
  }

  async drawFrame(frameNumberToDraw: number, animate = true) {
    if (this.waitingToPause && this.frameNumber > 1) {
      this.pause();
      return;
    } else {
      this.waitingToPause = false;
    }

    if (!this.isPlaying && animate) {
      return;
    }

    this.isAnimationActive = animate;

    // skip frames too far apart (e.g. while scrubbing).
    if (Math.abs(frameNumberToDraw - this.frameNumber) > 1 && !this.isLoop) {
      this.skipAndTryAgain(frameNumberToDraw, true);
      return;
    }

    this.canvasFrameNumber = frameNumberToDraw;

    const currentFrameImage = this.getCurrentFrameImage(frameNumberToDraw);
    if (!currentFrameImage) {
      const total = this.framesController.totalFrameCount;
      // while still streaming (length unknown) wait for the frame; only pause once
      // the stream has revealed the end and we're genuinely past it.
      if (total == null || frameNumberToDraw < total) {
        this.skipAndTryAgain(frameNumberToDraw, true);
        return;
      } else {
        this.pause(true);
        return;
      }
    }
    const image = currentFrameImage;
    if (this.isPlaying || this.isSeeking) {
      this.paintImageOnCanvas(image);
    }

    // this is when frame number changed through methods like keyboard navigation
    if (!this.isPlaying && !this.isSeeking && !animate) {
      this.paintImageOnCanvas(image);
      this.update(() => ({ currentFrameNumber: frameNumberToDraw }));
    }

    if (animate && !this.waitingToPause) {
      const total = this.framesController.totalFrameCount;
      if (total == null || frameNumberToDraw <= total) {
        this.update(({ playing }) => {
          if (playing) {
            return {
              currentFrameNumber:
                total == null
                  ? frameNumberToDraw
                  : Math.min(frameNumberToDraw, total),
            };
          }

          return {};
        });
      }

      setTimeout(() => {
        requestAnimationFrame(() => {
          const next = frameNumberToDraw + 1;
          // re-read: the stream may have revealed the end since this frame began.
          const total = this.framesController.totalFrameCount;

          // only stop/loop once the length is known; while streaming, keep advancing
          // as frames arrive.
          if (total != null && next > total) {
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
                currentFrameNumber: total,
              };
            });
            return;
          }
          this.drawFrame(next);
        });
      }, this.setTimeoutDelay);
    }
  }

  async play() {
    if (this.isAnimationActive) {
      return;
    }

    if (this.isThumbnail) {
      requestAnimationFrame(() => this.drawFrame(this.frameNumber));
    }
    // ImaVidLooker react handles it for non-thumbnail (modal) imavids
  }

  private getLookAheadFrameRange(currentFrameNumber: number) {
    if (typeof currentFrameNumber !== "number") {
      throw new Error("currentFrameNumber must be a number");
    }

    const totalFrameCount = this.framesController.totalFrameCount;

    // 5000 is an arbitrary upper bound for the multiplier
    const frameCountMultiplierWeight =
      1 + Math.min((totalFrameCount ?? 0) / 5000, 1);

    const onlySeedBuffered =
      this.framesController.storeBufferManager.totalFramesInBuffer <= 1;

    // the seed buys playback runway; every refill is a full batch so the buffer stays ahead of
    // the playhead in as few (expensive, GroupBy-skipping) round trips as possible.
    const offset = this.isSeeking
      ? 2
      : onlySeedBuffered
      ? INITIAL_LOOK_AHEAD_FRAMES
      : Math.max(
          this.targetFrameRate *
            LOOK_AHEAD_MULTIPLIER *
            frameCountMultiplierWeight,
          STREAM_BATCH_FRAMES
        );

    // while streaming (length unknown) fetch uncapped; the empty next page reveals the total.
    const frameRangeMax =
      totalFrameCount == null
        ? Math.trunc(currentFrameNumber + offset)
        : Math.min(Math.trunc(currentFrameNumber + offset), totalFrameCount);

    return [currentFrameNumber, frameRangeMax] as const;
  }

  /** Enqueue (and start) the look-ahead fetch off the given frame, if needed. */
  private enqueueLookAheadFetch(currentFrameNumber: number) {
    const necessaryFrameRange = this.getLookAheadFrameRange(currentFrameNumber);

    if (necessaryFrameRange[1] < necessaryFrameRange[0]) {
      return;
    }

    if (
      this.framesController.storeBufferManager.containsRange(
        necessaryFrameRange
      )
    ) {
      return;
    }

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

  private cancelHoverFetch() {
    if (this.hoverFetchTimer != null) {
      window.clearTimeout(this.hoverFetchTimer);
      this.hoverFetchTimer = undefined;
    }
  }

  /** Enqueue a (non-blocking) frame fetch if needed; thumbnail imavid only. */
  private ensureBuffers(state: Readonly<ImaVidState>) {
    // first fetch is heavy and uncancellable, so gate it on a persisted hover
    // (hoverProbed) — a scroll fires mouseenter but never mousemove.
    if (!state.hovering || !state.hoverProbed) {
      this.cancelHoverFetch();
      return;
    }

    const streaming =
      this.framesController.storeBufferManager.totalFramesInBuffer > 1;

    if (streaming) {
      this.cancelHoverFetch();
      this.enqueueLookAheadFetch(state.currentFrameNumber);
      return;
    }

    // arm the intent timer once; don't re-arm while one is pending or a fetch is in flight.
    if (
      this.hoverFetchTimer == null &&
      !this.framesController.isFetching &&
      this.framesController.fetchBufferManager.buffers.length === 0
    ) {
      this.hoverFetchTimer = window.setTimeout(() => {
        this.hoverFetchTimer = undefined;
        this.enqueueLookAheadFetch(this.frameNumber || 1);
      }, HOVER_FETCH_INTENT_MS);
    }
  }

  /**
   * Starts fetch if there are buffers in the fetch buffer manager
   */
  public checkFetchBufferManager() {
    const range = this.getLookAheadFrameRange(this.frameNumber || 1);
    if (
      range[1] >= range[0] &&
      !this.framesController.storeBufferManager.containsRange(range)
    ) {
      const unprocessed =
        this.framesController.fetchBufferManager.getUnprocessedBufferRange(
          this.framesController.storeBufferManager.getUnprocessedBufferRange(
            range
          )
        );
      if (unprocessed) {
        this.framesController.enqueueFetch(unprocessed);
      }
    }

    if (this.framesController.fetchBufferManager.buffers.length > 0) {
      this.framesController.resumeFetch();
    }
  }

  renderSelf(state: Readonly<ImaVidState>) {
    const {
      options: { playbackRate, loop },
      config: { thumbnail, src: thumbnailSrc, frameRate },
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
    this.isLoop = loop;
    this.isPlaying = playing;
    this.isSeeking = seeking;
    this.isThumbnail = thumbnail;
    this.frameNumber = currentFrameNumber;
    this.targetFrameRate = frameRate;

    if (this.playBackRate !== playbackRate || !this.setTimeoutDelay) {
      this.playBackRate = playbackRate;
      this.setTimeoutDelay = getMillisecondsFromPlaybackRate(
        frameRate,
        playbackRate
      );
    }

    // `destroyed` is called when looker is reset
    if (destroyed) {
      this.framesController.destroy();
    }

    if (this.isThumbnail) {
      this.ensureBuffers(state);
    } else {
      this.checkFetchBufferManager();
    }

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

    if (!playing && !seeking && thumbnail) {
      if (this.frameNumber !== this.canvasFrameNumber) {
        this.waitingToPause = false;
        this.drawFrameNoAnimation(this.frameNumber);
        this.isAnimationActive = false;
      }
    }

    return null;
  }
}

export * from "./frame-count";
export * from "./iv-controls";
export * from "./loader-bar";
export * from "./playback-rate";
export * from "./seek-bar";
export * from "./seek-bar-thumb";
