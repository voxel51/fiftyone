/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { VideoState } from "../state";
import { BaseElement, Events } from "./base";
import {
  muteUnmute,
  playPause,
  resetPlaybackRate,
  VIDEO_SHORTCUTS,
} from "./common/actions";
import { lookerClickable, lookerTime } from "./common/controls.module.css";
import { invisible, mediaOrCanvas } from "./media.module.css";
import { getFrameNumber, getFrameString, getTime, getTimeString } from "./util";

import {
  bufferingCircle,
  bufferingPath,
  lookerSeekBar,
  lookerVolume,
  lookerPlaybackRate,
} from "./video.module.css";
import volumeOff from "../icons/volumeOff.svg";
import volumeOn from "../icons/volume.svg";
import playbackRateIcon from "../icons/playbackRate.svg";

import { lookerLoader } from "./common/looker.module.css";
import { dispatchTooltipEvent } from "./common/util";

export class LoaderBar extends BaseElement<VideoState> {
  private buffering: boolean = false;

  isShown({ config: { thumbnail } }: Readonly<VideoState>) {
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

  renderSelf({ buffering, hovering }: Readonly<VideoState>) {
    if (buffering && hovering === this.buffering) {
      return this.element;
    }
    this.buffering = buffering && hovering;

    if (this.buffering) {
      this.element.style.display = "block";
    } else {
      this.element.style.display = "none";
    }
    return this.element;
  }
}

export class PlayButtonElement extends BaseElement<VideoState, HTMLDivElement> {
  private isPlaying: boolean = false;
  private isBuffering: boolean = false;
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

  renderSelf({ playing, buffering }: Readonly<VideoState>) {
    if (playing !== this.isPlaying || this.isBuffering !== buffering) {
      this.element.innerHTML = "";
      if (buffering) {
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
      this.isBuffering = buffering;
    }
    return this.element;
  }
}

export class SeekBarElement extends BaseElement<VideoState, HTMLInputElement> {
  getEvents(): Events<VideoState> {
    return {
      click: ({ event }) => {
        event.stopPropagation();
      },
      input: ({ update }) => {
        const progress = this.element.valueAsNumber / 100;
        update(({ duration, config: { frameRate } }) => {
          duration = duration as number;
          return {
            frameNumber: getFrameNumber(
              duration * progress,
              duration,
              frameRate
            ),
          };
        });
      },
      mousedown: ({ update }) =>
        update({
          locked: false,
          seeking: true,
        }),
      mouseup: ({ update }) => {
        const progress = this.element.valueAsNumber / 100;
        update(({ duration, config: { frameRate } }) => {
          duration = duration as number;
          return {
            frameNumber: getFrameNumber(
              duration * progress,
              duration,
              frameRate
            ),
            seeking: false,
          };
        });
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
    element.style.gridArea = "2 / 4 / 2 / 4";
    return element;
  }

  renderSelf({
    frameNumber,
    duration,
    config: { frameRate },
    options: { useFrameNumber },
  }: Readonly<VideoState>) {
    duration = duration as number;
    const timestamp = useFrameNumber
      ? getFrameString(frameNumber, duration, frameRate)
      : getTimeString(frameNumber, frameRate, duration);
    this.element.innerHTML = timestamp;
    return this.element;
  }
}

export class VideoElement extends BaseElement<VideoState, HTMLVideoElement> {
  private src: string = "";
  private duration: number = null;
  private frameRate: number = 0;
  private frameNumber: number = 1;
  private loop: boolean = false;
  private playbackRate: number = 1;
  private volume: number = 0;

  private requestCallback: (callback: (frameNumber: number) => void) => void;

  getEvents(): Events<VideoState> {
    return {
      error: ({ event, dispatchEvent }) => {
        dispatchEvent("error", { event });
      },
      loadedmetadata: ({}) => {
        this.element.currentTime = 0;
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
                  config: { frameRate },
                }) => {
                  if (!loaded) {
                    this.frameRate = frameRate;
                    return {
                      loaded: true,
                      playing: autoplay || playing,
                      duration: this.element.duration,
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
            update(({ frameNumber }) => ({ frameNumber }));
          });
        }
      },
      play: ({ update, dispatchEvent }) => {
        const callback = (newFrameNumber: number) => {
          update(
            ({
              playing,
              options: { loop },
              duration,
              config: { frameRate },
            }) => {
              this.frameNumber = newFrameNumber;
              duration = duration as number;

              if (
                newFrameNumber === getFrameNumber(duration, duration, frameRate)
              ) {
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
        this.requestCallback(() => {
          update(
            {
              frameNumber: getFrameNumber(
                this.element.currentTime,
                this.duration,
                this.frameRate
              ),
              disableOverlays: false,
            },
            (state, overlays) =>
              dispatchTooltipEvent(dispatchEvent, false)(state, overlays)
          );
        });
      },
      timeupdate: ({ dispatchEvent, update }) => {
        update(({ duration, config: { frameRate } }) => {
          dispatchEvent("timeupdate", {
            frameNumber: getFrameNumber(
              this.element.currentTime,
              duration as number,
              frameRate
            ),
          });

          return {};
        });
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("video");
    element.classList.add(mediaOrCanvas, invisible);
    element.preload = "metadata";
    element.muted = true;
    this.frameNumber = 1;

    this.requestCallback = (callback: (frameNumber: number) => void) => {
      requestAnimationFrame(() => {
        callback(
          getFrameNumber(
            this.element.currentTime,
            this.duration,
            this.frameRate
          )
        );
      });
    };

    return element;
  }

  renderSelf(state: Readonly<VideoState>) {
    const {
      options: { loop, volume, playbackRate },
      config: { src, frameRate },
      frameNumber,
      seeking,
      playing,
      loaded,
      buffering,
    } = state;
    if (this.loop !== loop) {
      this.element.loop = loop;
      this.loop = loop;
    }

    if (this.src !== src) {
      this.src = src;
      this.element.setAttribute("src", src);
    }

    if (loaded && playing && !seeking && !buffering && this.element.paused) {
      this.element.play();
    }
    if (loaded && (!playing || seeking || buffering) && !this.element.paused) {
      this.element.pause();
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
      // @ts-ignore
      this.element.currentTime = getTime(frameNumber, frameRate);
    }

    return this.element;
  }
}

export function withVideoLookerEvents(): () => Events<VideoState> {
  return function () {
    return {
      keydown: ({ event, update, dispatchEvent }) => {
        const e = event as KeyboardEvent;
        if (e.key in VIDEO_SHORTCUTS) {
          VIDEO_SHORTCUTS[e.key].action(update, dispatchEvent);
        }
      },
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
