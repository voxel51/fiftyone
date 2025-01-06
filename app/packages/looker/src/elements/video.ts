/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { playbackRate, volume as volumeIcon, volumeMuted } from "../icons";
import lockIcon from "../icons/lock.svg";
import lockOpenIcon from "../icons/lockOpen.svg";
import type { VideoState } from "../state";
import type { Events } from "./base";
import { BaseElement } from "./base";
import {
  muteUnmute,
  playPause,
  resetPlaybackRate,
  supportLock,
} from "./common/actions";
import { dispatchTooltipEvent } from "./common/util";
import {
  acquirePlayer,
  acquireThumbnailer,
  getFrameNumber,
  getFrameString,
  getFullTimeString,
  getTime,
} from "./util";

import {
  lookerClickable,
  lookerControlActive,
  lookerTime,
} from "./common/controls.module.css";
import { lookerLoader } from "./common/looker.module.css";
import {
  bufferingCircle,
  bufferingPath,
  lookerPlaybackRate,
  lookerSeekBar,
  lookerThumb,
  lookerThumbSeeking,
  lookerVolume,
} from "./video.module.css";

export class LoaderBar extends BaseElement<VideoState> {
  private shown: boolean = undefined;

  isShown({ thumbnail }: Readonly<VideoState["config"]>) {
    return thumbnail;
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.classList.add(lookerLoader);
    return element;
  }

  renderSelf({
    duration,
    buffering,
    hovering,
    waitingForVideo,
    waitingToStream,
    error,
    lockedToSupport,
    config: { frameRate, support },
  }: Readonly<VideoState>) {
    const shown =
      !error && hovering && (waitingForVideo || buffering || waitingToStream);

    if (shown === this.shown) {
      return this.element;
    }

    const start = lockedToSupport ? support[0] : 1;
    const end = lockedToSupport
      ? support[1]
      : getFrameNumber(duration, duration, frameRate);

    this.shown = shown;
    if (this.shown && start !== end) {
      this.element.style.display = "block";
    } else {
      this.element.style.display = "none";
    }
    return this.element;
  }
}

export class PlayButtonElement extends BaseElement<VideoState, HTMLDivElement> {
  private isPlaying: boolean;
  private isBuffering: boolean;
  private play: SVGElement;
  private pause: SVGElement;
  private buffering: SVGElement;
  private locked: boolean = null;
  private singleFrame: boolean = null;

  getEvents(): Events<VideoState> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.preventDefault();
        event.stopPropagation();
        playPause.action(update, dispatchEvent);
      },
    };
  }

  createHTMLElement() {
    this.pause = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.pause.setAttribute("height", "24");
    this.pause.setAttribute("width", "24");
    this.pause.setAttribute("viewBox", "0 0 24 24");

    let path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "var(--fo-palette-text-secondary)");
    path.setAttribute("d", "M6 19h4V5H6v14zm8-14v14h4V5h-4z");
    this.pause.appendChild(path);

    path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "none");
    path.setAttribute("d", "M0 0h24v24H0z");
    this.pause.appendChild(path);

    this.play = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.play.setAttribute("height", "24");
    this.play.setAttribute("width", "24");
    this.play.setAttribute("viewBox", "0 0 24 24");

    path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "rgb(238, 238, 238)");
    path.setAttribute("d", "M8 5v14l11-7z");
    this.play.appendChild(path);
    path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "none");
    path.setAttribute("d", "M0 0h24v24H0z");

    this.buffering = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );
    this.buffering.classList.add(bufferingCircle);
    this.buffering.setAttribute("viewBox", "12 12 24 24");
    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    circle.setAttribute("cx", "24");
    circle.setAttribute("cy", "24");
    circle.setAttribute("r", "9");
    circle.setAttribute("stroke-width", "2");
    circle.setAttribute("stroke", "rgb(238, 238, 238)");
    circle.setAttribute("fill", "none");
    circle.classList.add(bufferingPath);
    this.buffering.appendChild(circle);

    const element = document.createElement("div");
    element.style.marginTop = "2px";
    element.style.position = "relative";
    element.style.height = "24px";
    element.style.width = "24px";
    element.style.gridArea = "2 / 2 / 2 / 2";

    element.setAttribute("data-cy", "looker-video-play-button");

    return element;
  }

  renderSelf({
    playing,
    buffering,
    loaded,
    duration,
    lockedToSupport,
    config: { frameRate, support },
  }: Readonly<VideoState>) {
    let updatePlay = false;
    if (loaded) {
      if (this.locked !== lockedToSupport) {
        this.singleFrame = lockedToSupport
          ? support[0] === support[1]
          : getFrameNumber(duration, duration, frameRate) === 1;
        this.locked = lockedToSupport;
        updatePlay = true;
      }
    }

    if (
      playing !== this.isPlaying ||
      this.isBuffering !== buffering ||
      !loaded
    ) {
      this.element.textContent = "";
      if (buffering || !loaded) {
        this.element.appendChild(this.buffering);
        this.element.title = "Loading";
        this.element.style.cursor = "default";
      } else if (playing) {
        this.element.appendChild(this.pause);
        this.element.title = "Pause (space)";
        this.element.style.cursor = "pointer";
      } else {
        this.element.appendChild(this.play);
        this.element.title = "Play (space)";
        this.element.style.cursor = "pointer";
      }
      this.isPlaying = playing;
      this.isBuffering = buffering || !loaded;
    }

    if (updatePlay) {
      const path = this.play.children[0];
      path.setAttribute(
        "fill",
        this.singleFrame
          ? "var(--fo-palette-text-tertiary)"
          : "var(--fo-palette-text-secondary)"
      );
      this.element.style.cursor = this.singleFrame ? "unset" : "pointer";
      this.element.title = this.singleFrame ? "Only one frame" : "Play (space)";
    }
    return this.element;
  }
}

export class SeekBarThumbElement extends BaseElement<
  VideoState,
  HTMLDivElement
> {
  private active: boolean;

  getEvents(): Events<VideoState> {
    return {
      mouseenter: ({ update }) => {
        update({ seekBarHovering: true });
      },
      mousedown: ({ update }) => {
        update({
          seeking: true,
          seekBarHovering: true,
          options: { showJSON: false },
        });
      },
      mouseleave: ({ update }) => {
        update(({ seeking }) => ({ seekBarHovering: seeking }));
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.classList.add(lookerThumb);
    return element;
  }

  renderSelf({
    seeking,
    seekBarHovering,
    frameNumber,
    duration,
    config: { frameRate },
  }) {
    if (duration !== null) {
      const frameCount = getFrameNumber(duration, duration, frameRate);
      const value = ((frameNumber - 1) / (frameCount - 1)) * 100;
      this.element.style.setProperty(
        "--progress",
        `${Math.max(0, value - 0.5)}%`
      );
      //@ts-ignore
      this.element.value = value;
    }

    const active = seeking || seekBarHovering;
    if (active !== this.active) {
      this.active = active;

      active
        ? this.element.classList.add(lookerThumbSeeking)
        : this.element.classList.remove(lookerThumbSeeking);
    }

    return this.element;
  }
}

export class SeekBarElement extends BaseElement<VideoState, HTMLInputElement> {
  getEvents(): Events<VideoState> {
    return {
      mousedown: ({ update }) => {
        update({
          seeking: true,
          options: { showJSON: false },
        });
      },
      mouseenter: ({ update }) => {
        update({ seekBarHovering: true });
      },
      mouseleave: ({ update }) => {
        update(({ seeking }) => ({ seekBarHovering: seeking }));
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("input");
    element.setAttribute("type", "range");
    element.setAttribute("min", "0");
    element.setAttribute("max", "100");
    element.classList.add(lookerSeekBar);
    return element;
  }

  renderSelf({
    frameNumber,
    config: { frameRate, support, thumbnail },
    duration,
    buffers,
    lockedToSupport,
  }: Readonly<VideoState>) {
    if (thumbnail) {
      return this.element;
    }

    if (duration !== null) {
      const frameCount = getFrameNumber(duration, duration, frameRate);
      const start = lockedToSupport
        ? ((support[0] - 1) / (frameCount - 1)) * 100
        : 0;

      this.element.style.setProperty("--start", `${start}%`);

      const end = lockedToSupport
        ? ((support[1] - 1) / (frameCount - 1)) * 100
        : 100;

      this.element.style.setProperty("--end", `${end}%`);
      let bufferValue = 100;

      if (frameCount - 1 > 0) {
        let bufferIndex = 0;

        for (let i = 0; i < buffers.length; i++) {
          if (buffers[i][0] <= frameNumber && buffers[i][1] >= frameNumber) {
            bufferIndex = i;
            break;
          }
        }
        bufferValue = ((buffers[bufferIndex][1] - 1) / (frameCount - 1)) * 100;
      }

      this.element.style.setProperty(
        "--buffer-progress",
        `${Math.min(bufferValue, end)}%`
      );
      const value = ((frameNumber - 1) / (frameCount - 1)) * 100;
      this.element.style.display = "block";
      this.element.style.setProperty("--progress", `${value}%`);

      //@ts-ignore
      this.element.value = value;
    } else {
      this.element.style.display = "none";
    }
    return this.element;
  }
}

export class TimeElement extends BaseElement<VideoState> {
  createHTMLElement() {
    const element = document.createElement("div");
    element.setAttribute("data-cy", "looker-video-time");
    element.classList.add(lookerTime);
    element.style.gridArea = "2 / 5 / 2 / 5";
    return element;
  }

  renderSelf({
    frameNumber,
    duration,
    config: { frameRate },
    options: { useFrameNumber },
  }: Readonly<VideoState>) {
    if (typeof duration !== "number") {
      this.element.textContent = "";
      return this.element;
    }

    const timestamp = useFrameNumber
      ? getFrameString(frameNumber, duration, frameRate)
      : getFullTimeString(frameNumber, frameRate, duration);
    this.element.textContent = timestamp;
    return this.element;
  }
}

export class VideoElement extends BaseElement<VideoState, HTMLVideoElement> {
  private canvas: HTMLCanvasElement;
  private frameNumber: number;
  private loop = false;
  private playbackRate = 1;
  private posterFrame: number;
  private requestCallback: (callback: (time: number) => void) => void;
  private release: () => void;
  private src: string;
  private volume: number;
  private waitingToPause = false;
  private waitingToPlay = false;
  private waitingToRelease = false;

  imageSource: HTMLCanvasElement | HTMLVideoElement;

  getEvents(): Events<VideoState> {
    return {
      error: ({ update }) => {
        this.releaseVideo();
        update({ error: true });
      },
      loadedmetadata: ({ update }) => {
        update(({ config: { frameRate }, frameNumber }) => {
          this.element.currentTime = getTime(frameNumber, frameRate);
          return { duration: this.element.duration };
        });
      },
      seeked: ({ update, dispatchEvent }) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            update(
              ({
                config: { thumbnail },
                loaded,
                playing,
                options: { autoplay },
              }) => {
                // thumbnails are initialized with a poster
                if (!thumbnail && !loaded) {
                  return {
                    loaded: true,
                    playing: autoplay || playing,
                    dimensions: [
                      this.element.videoWidth,
                      this.element.videoHeight,
                    ],
                    waitingForVideo: false,
                  };
                }

                return {
                  waitingForVideo: false,
                };
              }
            );
            dispatchEvent("load");
          });
        });
      },
      play: ({ update, dispatchEvent }) => {
        const callback = (time: number) => {
          update(
            ({
              duration,
              playing,
              options: { loop },
              config: { frameRate, support },
              lockedToSupport,
            }) => {
              let newFrameNumber = getFrameNumber(time, duration, frameRate);
              const end = lockedToSupport
                ? support[1]
                : getFrameNumber(duration, duration, frameRate);

              if (newFrameNumber >= end) {
                const start = lockedToSupport ? support[0] : 1;
                playing = loop;
                newFrameNumber = loop ? start : end;
              } else {
                this.frameNumber = newFrameNumber;
              }

              return {
                frameNumber: newFrameNumber,
                playing,
              };
            },
            ({ playing, seeking, buffering }) => {
              if (playing && !seeking && !buffering) {
                this.requestCallback(callback);
              }
            }
          );
        };

        update(
          ({ frameNumber }) => ({
            playing: true,
            disableOverlays: true,
            frameNumber,
            rotate: 0,
          }),
          (state, overlays) => {
            dispatchTooltipEvent(dispatchEvent, state.playing)(state, overlays);
            this.requestCallback(callback);
          }
        );
      },
      pause: ({ update, dispatchEvent }) => {
        update(
          {
            disableOverlays: false,
          },
          (state, overlays) =>
            dispatchTooltipEvent(dispatchEvent, false)(state, overlays)
        );
      },
      timeupdate: ({ dispatchEvent, update }) => {
        update(({ duration, config: { frameRate } }) => {
          dispatchEvent("timeupdate", {
            frameNumber: getFrameNumber(
              this.element.currentTime,
              duration,
              frameRate
            ),
          });

          return {};
        });
      },
    };
  }

  createHTMLElement() {
    this.element = null;
    this.update(({ config: { thumbnail, src, frameRate, support } }) => {
      this.src = src;
      this.posterFrame = support ? support[0] : 1;
      if (thumbnail) {
        this.canvas = document.createElement("canvas");
        this.canvas.style.imageRendering = "pixelated";
        acquireThumbnailer().then(([video, release]) => {
          const error = () => {
            video.removeEventListener("error", error);
            video.removeEventListener("seeked", seeked);
            release();
            this.update({ error: true, loaded: true, dimensions: [512, 512] });
          };

          const seeked = () => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                setTimeout(() => {
                  const ctx = this.canvas.getContext("2d");
                  ctx.imageSmoothingEnabled = false;
                  ctx.drawImage(video, 0, 0);
                  release();
                  video.removeEventListener("seeked", seeked);
                  video.removeEventListener("error", error);
                  this.update({
                    hasPoster: true,
                    duration: video.duration,
                    loaded: true,
                  });
                }, 20);
              });
            });
          };

          const load = () => {
            video.addEventListener("seeked", seeked);
            video.currentTime = support ? getTime(support[0], frameRate) : 0;
            video.removeEventListener("loadedmetadata", load);

            this.canvas.width = video.videoWidth;
            this.canvas.height = video.videoHeight;

            this.update({ dimensions: [video.videoWidth, video.videoHeight] });
          };

          video.src = src;
          video.addEventListener("error", error);
          video.addEventListener("loadedmetadata", load);
        });
      } else {
        this.element = document.createElement("video");
        this.element.preload = "metadata";
        this.element.src = src;
      }

      return {};
    });

    this.requestCallback = (callback: (time: number) => void) => {
      requestAnimationFrame(() => {
        this.element && callback(this.element.currentTime);
      });
    };

    return this.element;
  }

  private attachEvents() {
    for (const eventType in this.events) {
      this.element.addEventListener(eventType, this.events[eventType]);
    }
  }
  private removeEvents() {
    for (const eventType in this.events) {
      this.element.removeEventListener(eventType, this.events[eventType]);
    }
  }

  private acquireVideo() {
    let called = false;

    this.update(({ waitingForVideo, error }) => {
      if (!waitingForVideo && !error) {
        acquirePlayer().then(([video, release]) => {
          this.update(
            ({ frameNumber, hovering, config: { frameRate, thumbnail } }) => {
              this.element = video;
              this.release = release;
              if ((!hovering && thumbnail) || this.waitingToRelease) {
                this.releaseVideo();
              } else {
                this.attachEvents();
                this.frameNumber = getTime(frameNumber, frameRate);
                this.element.currentTime = getTime(frameNumber, frameRate);
                this.element.src = this.src;
              }

              return {};
            }
          );
        });

        called = true;

        return { waitingForVideo: true };
      }

      return {};
    });

    return called;
  }

  private releaseVideo() {
    if (this.waitingToPause || this.waitingToPlay || !this.element) {
      this.waitingToRelease = true;
      this.imageSource = this.canvas;
      this.canvas &&
        this.update(({ waitingForVideo }) =>
          waitingForVideo ? { waitingForVideo: false } : {}
        );
      return;
    }

    !this.element.paused && this.element.pause();

    this.waitingToRelease = false;

    this.removeEvents();
    this.element = null;
    this.release?.();
    this.release = null;

    this.update({
      waitingForVideo: false,
      frameNumber: this.posterFrame,
      playing: false,
    });
  }

  renderSelf({
    options: { loop, volume, playbackRate },
    config: { frameRate, thumbnail },
    frameNumber,
    seeking,
    playing,
    loaded,
    buffering,
    hovering,
    hasPoster,
    destroyed,
  }: Readonly<VideoState>) {
    if (destroyed) {
      this.releaseVideo();
    }

    if (!this.element) {
      if (hovering && thumbnail) {
        const result = this.acquireVideo();

        if (result) {
          return null;
        }
      }
    } else if (thumbnail && !hovering) {
      this.releaseVideo();
      return null;
    }

    if (hasPoster && frameNumber === this.posterFrame) {
      this.imageSource = this.canvas;
    } else {
      this.imageSource = this.element;
    }

    if (!this.element) {
      return null;
    }

    if (loaded && playing && !seeking && !buffering && this.element.paused) {
      this.waitingToPlay = true;
      this.element.play().then(() => {
        this.waitingToPlay = false;
        this.waitingToPause && this.element && this.element.pause();
        this.waitingToPause = false;

        if (this.waitingToRelease) {
          this.releaseVideo();
          return null;
        }
      });
    }
    if (loaded && (!playing || seeking || buffering) && !this.element.paused) {
      if (this.waitingToPlay) {
        this.waitingToPause = true;
      } else {
        this.element.pause();
      }
    }

    if (this.loop !== loop) {
      this.element.loop = loop;
      this.loop = loop;
    }

    if (this.playbackRate !== playbackRate) {
      this.element.playbackRate = playbackRate;
      this.playbackRate = playbackRate;
    }

    if (this.volume !== volume) {
      this.element.volume = volume;
      this.volume = volume;
    }

    if (this.frameNumber !== frameNumber) {
      this.element.currentTime = getTime(frameNumber, frameRate);
      this.frameNumber = frameNumber;
    }

    return null;
  }
}

export function withVideoLookerEvents(): () => Events<VideoState> {
  return () => {
    let timeout: ReturnType<typeof setTimeout> = null;
    return {
      mouseenter: ({ update }) => {
        update(({ config: { thumbnail } }) => {
          if (thumbnail) {
            timeout = setTimeout(() => {
              update({
                playing: true,
                waitingToStream: false,
              });
            }, 500);

            return {
              waitingToStream: true,
            };
          }
          return {};
        });
      },
      mouseleave: ({ update }) => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        update(({ config: { thumbnail, support } }) => {
          if (thumbnail) {
            return {
              frameNumber: support ? support[0] : 1,
              playing: false,
              waitingToStream: false,
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
  {
    seeking,
    duration,
    config: { frameRate, support },
    lockedToSupport,
  }: Readonly<VideoState>,
  event: MouseEvent
): Partial<VideoState> => {
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
      lockedToSupport: support
        ? lockedToSupport &&
          frameNumber >= support[0] &&
          frameNumber <= support[1]
        : false,
    };
  }
  return {};
};

class VolumeBarContainerElement extends BaseElement<
  VideoState,
  HTMLDivElement
> {
  getEvents(): Events<VideoState> {
    return {};
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.classList.add(lookerVolume);
    return element;
  }

  renderSelf() {
    return this.element;
  }
}

class VolumBarElement extends BaseElement<VideoState, HTMLInputElement> {
  private volume: number;

  getEvents(): Events<VideoState> {
    return {
      click: ({ event }) => {
        event.stopPropagation();
      },
      input: ({ update, dispatchEvent }) => {
        const percent = this.element.valueAsNumber;

        dispatchEvent("options", { volume: percent });

        update({
          options: {
            volume: percent,
          },
        });
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("input");
    element.setAttribute("type", "range");
    element.setAttribute("min", "0");
    element.setAttribute("max", "1");
    element.setAttribute("step", "0.01");
    return element;
  }

  renderSelf({ options: { volume } }: Readonly<VideoState>) {
    if (this.volume !== volume) {
      this.element.style.setProperty("--volume", `${volume * 100}%`);
      this.element.value = volume.toFixed(4);
      this.element.title = `Volume ${(volume * 100).toFixed(0)}%`;

      this.volume = volume;
    }
    return this.element;
  }
}

class VolumeIconElement extends BaseElement<VideoState, HTMLDivElement> {
  private muted: boolean;

  getEvents(): Events<VideoState> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        muteUnmute.action(update, dispatchEvent);
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.classList.add(lookerClickable);
    element.style.padding = "2px";
    element.style.display = "flex";
    return element;
  }

  renderSelf({ options: { volume } }) {
    if ((volume === 0) === this.muted) {
      return this.element;
    }

    this.muted = volume === 0;
    if (this.element.firstChild) this.element.firstChild.remove();
    if (this.muted) {
      this.element.title = "Unmute (m)";
      this.element.appendChild(volumeMuted);
    } else {
      this.element.title = "Mute (m)";
      this.element.appendChild(volumeIcon);
      this.element;
    }

    return this.element;
  }
}

export const VOLUME = {
  node: VolumeBarContainerElement,
  children: [{ node: VolumeIconElement }, { node: VolumBarElement }],
};

class PlaybackRateContainerElement extends BaseElement<
  VideoState,
  HTMLDivElement
> {
  getEvents(): Events<VideoState> {
    return {};
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.classList.add(lookerPlaybackRate);
    element.setAttribute("data-cy", "looker-video-speed-button");
    return element;
  }

  renderSelf() {
    return this.element;
  }
}

class PlaybackRateBarElement extends BaseElement<VideoState, HTMLInputElement> {
  private playbackRate: number;

  getEvents(): Events<VideoState> {
    return {
      click: ({ event }) => {
        event.stopPropagation();
      },
      input: ({ update, dispatchEvent }) => {
        dispatchEvent("options", {
          playbackRate: this.element.valueAsNumber,
        });
        update({
          options: {
            playbackRate: this.element.valueAsNumber,
          },
        });
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("input");
    element.setAttribute("type", "range");
    element.setAttribute("min", "0.1");
    element.setAttribute("max", "2");
    element.setAttribute("step", "0.1");
    return element;
  }

  renderSelf({
    options: { playbackRate },
    config: { frameRate },
  }: Readonly<VideoState>) {
    if (this.playbackRate !== playbackRate) {
      this.element.title = `${playbackRate.toFixed(1)}x ${(
        frameRate * playbackRate
      ).toFixed(2)} fps`;
      this.element.style.setProperty(
        "--playback",
        `${(playbackRate / 2) * 100}%`
      );
      this.element.value = playbackRate.toFixed(4);
      this.playbackRate = playbackRate;
    }

    return this.element;
  }
}

class PlaybackRateIconElement extends BaseElement<VideoState, HTMLDivElement> {
  getEvents(): Events<VideoState> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        resetPlaybackRate.action(update, dispatchEvent);
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.classList.add(lookerClickable);
    element.style.padding = "2px";
    element.style.display = "flex";
    element.title = "Reset playback rate (p)";
    element.appendChild(playbackRate);
    return element;
  }

  renderSelf() {
    return this.element;
  }
}

export const PLAYBACK_RATE = {
  node: PlaybackRateContainerElement,
  children: [
    { node: PlaybackRateIconElement },
    { node: PlaybackRateBarElement },
  ],
};

export class SupportLockButtonElement extends BaseElement<
  VideoState,
  HTMLImageElement
> {
  private active: boolean;

  isShown(config: Readonly<VideoState["config"]>) {
    return Boolean(config.support);
  }

  getEvents(): Events<VideoState> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.stopPropagation();
        event.preventDefault();
        supportLock.action(update, dispatchEvent);
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("img");
    element.style.padding = "2px";
    element.title = `${supportLock.title} (${supportLock.shortcut})`;
    element.style.gridArea = "2 / 8 / 2 / 8";
    element.style.cursor = "pointer";
    return element;
  }

  renderSelf({ lockedToSupport }) {
    if (this.active !== lockedToSupport) {
      lockedToSupport
        ? this.element.classList.add(lookerControlActive)
        : this.element.classList.remove(lookerControlActive);
      this.element.src = lockedToSupport ? lockIcon : lockOpenIcon;
      this.active = lockedToSupport;
    }

    return this.element;
  }
}
