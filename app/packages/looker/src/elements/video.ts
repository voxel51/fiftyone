/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { StateUpdate, VideoState } from "../state";
import { BaseElement, Events } from "./base";
import { muteUnmute, playPause, resetPlaybackRate } from "./common/actions";
import { lookerClickable, lookerTime } from "./common/controls.module.css";
import {
  getFrameNumber,
  getFrameString,
  getFullTimeString,
  getTime,
} from "./util";

import {
  bufferingCircle,
  bufferingPath,
  lookerSeekBar,
  lookerVolume,
  lookerPlaybackRate,
  lookerThumb,
  lookerThumbSeeking,
} from "./video.module.css";
import volumeOff from "../icons/volumeOff.svg";
import volumeOn from "../icons/volume.svg";
import playbackRateIcon from "../icons/playbackRate.svg";

import { lookerLoader } from "./common/looker.module.css";
import { dispatchTooltipEvent } from "./common/util";

export class LoaderBar extends BaseElement<VideoState> {
  private buffering: boolean = false;

  isShown({ thumbnail }: Readonly<VideoState["config"]>) {
    return thumbnail;
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.style.height = "5px";
    element.style.position = "absolute";
    element.style.bottom = "0";
    element.style.width = "100%";
    element.style.backgroundImage = `linear-gradient(
      130deg,
      rgba(225, 100, 40, 0) 0%,
      rgb(225, 100, 40) 50%,
      rgba(225, 100, 40, 0) 100%
    )`;
    element.classList.add(lookerLoader);
    return element;
  }

  renderSelf({ buffering, hovering, waitingForVideo }: Readonly<VideoState>) {
    if ((buffering || waitingForVideo) && hovering === this.buffering) {
      return this.element;
    }
    this.buffering = (buffering || waitingForVideo) && hovering;

    if (this.buffering) {
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
    path.setAttribute("fill", "rgb(238, 238, 238)");
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
    return element;
  }

  renderSelf({ playing, buffering, loaded }: Readonly<VideoState>) {
    if (
      playing !== this.isPlaying ||
      this.isBuffering !== buffering ||
      !loaded
    ) {
      this.element.innerHTML = "";
      if (buffering || !loaded) {
        this.element.appendChild(this.buffering);
        this.element.title = "Loading labels";
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
    config: { frameRate, thumbnail },
    duration,
    buffers,
  }: Readonly<VideoState>) {
    if (thumbnail) {
      return this.element;
    }

    if (duration !== null) {
      const frameCount = getFrameNumber(duration, duration, frameRate);
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
      this.element.style.setProperty("--buffer-progress", `${bufferValue}%`);
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
      this.element.innerHTML = "";
      return this.element;
    }

    const timestamp = useFrameNumber
      ? getFrameString(frameNumber, duration, frameRate)
      : getFullTimeString(frameNumber, frameRate, duration);
    this.element.innerHTML = timestamp;
    return this.element;
  }
}

export class VideoElement extends BaseElement<VideoState, HTMLVideoElement> {
  private canvas: HTMLCanvasElement;
  private duration: number = null;
  private frameCount: number;
  private frameNumber: number = 1;
  private frameRate: number = 0;
  private loop: boolean = false;
  private playbackRate: number = 1;
  private requestCallback: (callback: (frameNumber: number) => void) => void;
  private release: () => void;
  private src: string;
  private update: StateUpdate<VideoState>;
  private volume: number = 0;
  private waitingToPause: boolean = false;
  private waitingToPlay: boolean = false;
  private waitingToRelease: boolean = false;

  imageSource: HTMLCanvasElement | HTMLVideoElement;

  getEvents(): Events<VideoState> {
    return {
      error: ({ event, dispatchEvent }) => {
        dispatchEvent("error", { event });
      },
      loadedmetadata: ({ update }) => {
        this.element.currentTime = 0;
        update(({ config: { frameRate } }) => {
          this.frameRate = frameRate;
          const duration = this.element.duration;
          this.frameCount = getFrameNumber(duration, duration, frameRate);
          return { duration };
        });
      },
      seeked: ({ update, dispatchEvent }) => {
        if (this.duration === null) {
          this.duration = this.element.duration;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              update(
                ({
                  loaded,
                  playing,
                  options: { autoplay },
                  hasPoster,
                  frameNumber,
                  hovering,
                  config: { thumbnail },
                }) => {
                  if (!hasPoster && frameNumber === 1 && thumbnail) {
                    this.canvas.getContext("2d").drawImage(this.element, 0, 0);
                    hasPoster = true;
                    !hovering && thumbnail && this.releaseVideo();
                  }

                  if (!loaded) {
                    return {
                      loaded: true,
                      playing: autoplay || playing,
                      hasPoster,
                      waitingForVideo: false,
                    };
                  }

                  return {};
                }
              );
              dispatchEvent("load");
            });
          });
        } else {
          requestAnimationFrame(() => {
            update(({ frameNumber }) => ({
              frameNumber,
              waitingForVideo: false,
            }));
          });
        }
      },
      play: ({ update, dispatchEvent }) => {
        const callback = (newFrameNumber: number) => {
          update(
            ({ playing, options: { loop } }) => {
              this.frameNumber = newFrameNumber;

              if (newFrameNumber === this.frameCount) {
                playing = loop;
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
          ({ frameNumber, duration, config: { frameRate } }) => {
            duration = duration as number;
            frameNumber =
              frameNumber === getFrameNumber(duration, duration, frameRate)
                ? 1
                : frameNumber;

            return {
              playing: true,
              frameNumber,
              disableOverlays: true,
              rotate: 0,
            };
          },
          (state, overlays) => {
            dispatchTooltipEvent(dispatchEvent, state.playing)(state, overlays);
            this.requestCallback(callback);
          }
        );
      },
      pause: ({ update, dispatchEvent }) => {
        this.requestCallback((frameNumber) => {
          this.frameNumber = null;
          update(
            {
              disableOverlays: false,
              frameNumber,
            },
            (state, overlays) =>
              dispatchTooltipEvent(dispatchEvent, false)(state, overlays)
          );
        });
      },
      ended: ({ update }) => {
        requestAnimationFrame(() => {
          update(({ options: { loop } }) => ({
            frameNumber: loop ? 1 : this.frameCount,
            playing: loop,
          }));
        });
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

  createHTMLElement(update: StateUpdate<VideoState>) {
    this.update = update;
    this.element = null;
    this.frameNumber = 1;
    update(({ config: { thumbnail, dimensions, src } }) => {
      this.src = src;
      if (thumbnail) {
        this.canvas = document.createElement("canvas");
        this.canvas.width = dimensions[0];
        this.canvas.height = dimensions[1];
        this.acquireVideo();
      } else {
        this.element = document.createElement("video");
        this.element.preload = "metadata";
        this.element.src = src;
      }

      return {};
    });

    this.requestCallback = (callback: (frameNumber: number) => void) => {
      requestAnimationFrame(() => {
        this.element &&
          callback(
            Math.min(
              getFrameNumber(
                this.element.currentTime,
                this.duration,
                this.frameRate
              ),
              this.frameCount
            )
          );
      });
    };

    return this.element;
  }

  private acquireVideo() {
    let called = false;

    this.update(({ waitingForVideo }) => {
      if (!waitingForVideo) {
        acquireVideo().then(([video, release]) => {
          this.update(({ hovering, config: { thumbnail }, hasPoster }) => {
            this.element = video;
            this.release = release;
            if (!hovering && thumbnail && hasPoster) {
              this.releaseVideo();
            } else {
              this.attachEvents();
              this.element.src = this.src;
            }

            return {};
          });
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
      this.update(({ waitingForVideo }) =>
        waitingForVideo ? { waitingForVideo: false } : {}
      );
      return;
    }

    !this.element.paused && this.element.pause();

    this.waitingToRelease = false;

    this.removeEvents();
    this.element = null;
    this.release && this.release();
    this.release = null;

    this.update({ waitingForVideo: false, frameNumber: 1, playing: false });
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
  }: Readonly<VideoState>) {
    if (!this.element) {
      if (hovering) {
        const result = this.acquireVideo();

        if (result) {
          return;
        }
      }
    } else if (!hovering && thumbnail && hasPoster) {
      this.releaseVideo();
      return null;
    }

    if (frameNumber === 1 && hasPoster) {
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
        }
      });
    }
    if (loaded && (!playing || seeking || buffering) && !this.element.paused) {
      !this.waitingToPlay ? this.element.pause() : (this.waitingToPause = true);
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
        update(({ seeking, duration, config: { frameRate } }) => {
          if (duration && seeking) {
            const element = event.currentTarget as HTMLDivElement;
            const { width, left } = element.getBoundingClientRect();
            const frameCount = getFrameNumber(duration, duration, frameRate);

            return {
              frameNumber: Math.min(
                Math.max(
                  1,
                  Math.round(((event.clientX + 6 - left) / width) * frameCount)
                ),
                frameCount
              ),
            };
          }
          return {};
        });
      },
      mouseup: ({ event, update }) => {
        update(({ seeking, duration, config: { frameRate } }) => {
          if (seeking && duration) {
            const element = event.currentTarget as HTMLDivElement;
            const { width, left } = element.getBoundingClientRect();
            const frameCount = getFrameNumber(duration, duration, frameRate);

            return {
              seeking: false,
              frameNumber: Math.min(
                Math.max(
                  1,
                  Math.round(((event.clientX + 6 - left) / width) * frameCount)
                ),
                frameCount
              ),
            };
          }
          return {};
        });
      },
    };
  };
}

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
      input: ({ update }) => {
        const percent = this.element.valueAsNumber;
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
      this.element.style.display = "block";
      this.element.style.setProperty("--volume", `${volume * 100}%`);
      this.element.value = volume.toFixed(4);
      this.element.title = `Volume ${(volume * 100).toFixed(0)}%`;

      this.volume = volume;
    }
    return this.element;
  }
}

class VolumeIconElement extends BaseElement<VideoState, HTMLImageElement> {
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
    const element = document.createElement("img");
    element.classList.add(lookerClickable);
    element.style.padding = "2px";
    return element;
  }

  renderSelf({ options: { volume } }) {
    if ((volume === 0) === this.muted) {
      return this.element;
    }

    this.muted = volume === 0;
    if (this.muted) {
      this.element.title = "Unmute (m)";
      this.element.src = volumeOff;
    } else {
      this.element.title = "Mute (m)";
      this.element.src = volumeOn;
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
      input: ({ update }) => {
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
    this.element.style.display = "block";

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

class PlaybackRateIconElement extends BaseElement<
  VideoState,
  HTMLImageElement
> {
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
    const element = document.createElement("img");
    element.classList.add(lookerClickable);
    element.style.padding = "2px";
    element.title = "Reset playback rate (p)";
    element.src = playbackRateIcon;
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

const acquireVideo = (() => {
  const VIDEOS: HTMLVideoElement[] = [];
  const MAX_VIDEOS = 8;
  const QUEUE = [];
  const FREE = [];

  const release = (video: HTMLVideoElement) => {
    return () => {
      if (!video.paused) {
        throw new Error("Release playing video");
      }

      video.pause();
      video.muted = true;
      video.preload = "metadata";
      video.loop = false;
      video.src = "";
      if (QUEUE.length) {
        const resolve = QUEUE.shift();
        resolve([video, release(video)]);
      } else {
        FREE.push(video);
      }
    };
  };

  return (): Promise<[HTMLVideoElement, () => void]> => {
    if (FREE.length) {
      const video = FREE.shift();
      return Promise.resolve([video, release(video)]);
    }

    if (VIDEOS.length < MAX_VIDEOS) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.loop = false;

      VIDEOS.push(video);
      return Promise.resolve([video, release(video)]);
    }

    return new Promise<[HTMLVideoElement, () => void]>((resolve) => {
      QUEUE.push(resolve);
    });
  };
})();
