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
  event: MouseEvent,
): Partial<ImaVidState> => {
  const totalFramesCount = frameStoreController.totalFrameCount;

  if (totalFramesCount > 0 && seeking) {
    const element = event.currentTarget as HTMLDivElement;
    const { width, left } = element.getBoundingClientRect();

    const frameNumber = Math.min(
      Math.max(
        1,
        Math.round(((event.clientX + 6 - left) / width) * totalFramesCount),
      ),
      totalFramesCount,
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
  private hoverProbed: boolean;
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

        this.framesController.setFrameRate(frameRate);
        this.framesController.setMediaField(mediaField);

        return {};
      },
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
        setTimeout(resolve, BUFFERING_PAUSE_TIMEOUT),
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

    // if abs(frameNumberToDraw, currentFrameNumber) > 1, then skip
    // this is to avoid drawing frames that are too far apart
    // this can happen when user is scrubbing through the video
    if (Math.abs(frameNumberToDraw - this.frameNumber) > 1 && !this.isLoop) {
      this.skipAndTryAgain(frameNumberToDraw, true);
      return;
    }

    this.canvasFrameNumber = frameNumberToDraw;

    const currentFrameImage = this.getCurrentFrameImage(frameNumberToDraw);
    if (!currentFrameImage) {
      const total = this.framesController.totalFrameCount;
      // while still streaming (length unknown) wait for the frame; only pause once
      // the stream has revealed the end and we're genuinely past it (frame
      // numbers are 1-based, so frame === total is the valid last frame).
      if (total == null || frameNumberToDraw <= total) {
        // a stalled draw loop stops firing renderSelf/ensureBuffers, so this
        // nudge is the ONLY fetch driver left — it must always fire for a real
        // hover (hoverProbed = actual mousemove, never a scroll-past
        // mouseenter), including after evictions drain the buffer.
        if (!this.isThumbnail || this.hoverProbed) {
          this.enqueueLookAheadFetch(frameNumberToDraw);
        }
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

  private getLookAheadFrames(): number {
    if (this.isSeeking) {
      return 2;
    }

    const totalFrameCount = this.framesController.totalFrameCount;
    // 5000 is an arbitrary upper bound for the multiplier
    const weight = 1 + Math.min((totalFrameCount ?? 0) / 5000, 1);
    const onlySeedBuffered =
      this.framesController.storeBufferManager.totalFramesInBuffer <= 1;

    // frames to keep buffered ahead of the playhead. The initial request asks
    // for the seed PLUS a full batch up front — fetchMore publishes the small
    // first chunk for fast first paint while the rest streams in the same
    // request, so playback never drains the seed waiting on a serial second
    // fetch
    return onlySeedBuffered
      ? INITIAL_LOOK_AHEAD_FRAMES + STREAM_BATCH_FRAMES
      : Math.max(
          this.targetFrameRate * LOOK_AHEAD_MULTIPLIER * weight,
          STREAM_BATCH_FRAMES,
        );
  }

  /**
   * Fetch the next look-ahead batch when the buffered runway ahead of the
   * playhead runs low. One batch is in flight at a time, so playback prefetches
   * the next batch while the current one plays — never a per-frame sliver, and
   * never reading more than one look-ahead past the playhead (no whole-group sweep).
   */
  private enqueueLookAheadFetch(currentFrameNumber: number) {
    const controller = this.framesController;

    // one batch in flight at a time
    if (
      controller.isFetching ||
      controller.fetchBufferManager.buffers.length > 0
    ) {
      return;
    }

    const lookAhead = this.getLookAheadFrames();
    const total = controller.totalFrameCount;

    // furthest contiguous buffered frame ahead of the playhead
    const store = controller.storeBufferManager;
    const idx = store.getRangeIndexForFrame(currentFrameNumber);
    const bufferedEdge =
      idx !== -1 ? store.buffers[idx][1] : currentFrameNumber - 1;

    // enough runway already buffered ahead — nothing to fetch
    if (bufferedEdge - currentFrameNumber >= lookAhead) {
      return;
    }

    const start = bufferedEdge + 1;
    if (total != null && start > total) {
      return;
    }

    let end = currentFrameNumber + lookAhead;
    if (total != null) {
      end = Math.min(end, total);
    }
    if (end < start) {
      return;
    }

    controller.enqueueFetch([start, end] as const);
    controller.resumeFetch();
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
      // called every rendered frame as the playhead advances; enqueueLookAheadFetch
      // itself gates on an in-flight batch and on sufficient runway, so this keeps
      // the buffer filled ahead without firing a request per frame
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
    // same runway-gated, one-batch-at-a-time refill as the grid; bounds how far
    // ahead the modal reads so a single group can't be swept end-to-end
    this.enqueueLookAheadFetch(this.frameNumber || 1);

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
    this.hoverProbed = Boolean(state.hoverProbed);
    this.frameNumber = currentFrameNumber;
    this.targetFrameRate = frameRate;

    if (this.playBackRate !== playbackRate || !this.setTimeoutDelay) {
      this.playBackRate = playbackRate;
      this.setTimeoutDelay = getMillisecondsFromPlaybackRate(
        frameRate,
        playbackRate,
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
      // check if current frame number is what has been drawn
      // if they're different, then draw the frame
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
