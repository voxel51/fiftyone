/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { VideoState } from "../state";
import { BaseElement, Events } from "./base";
import { playPause, VIDEO_SHORTCUTS } from "./common/actions";
import {
  getFrameNumber,
  getFrameString,
  getTime,
  getTimeString,
  transformWindowElement,
} from "./util";

export class LoaderBar extends BaseElement<VideoState> {
  private buffering: boolean;

  isShown({ config: { thumbnail } }) {
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
    element.classList.add("looker-loader");
    return element;
  }

  renderSelf({ buffering, hovering }) {
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
    this.pause.style.marginTop = "-4px";

    let path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "rgb(238, 238, 238)");
    path.setAttribute("d", "M6 19h4V5H6v14zm8-14v14h4V5h-4z");
    this.pause.appendChild(path);

    path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "none");
    path.setAttribute("d", "M0 0h24v24H0z");
    this.pause.appendChild(path);

    this.play = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.pause.setAttribute("height", "24");
    this.pause.setAttribute("width", "24");
    this.pause.setAttribute("viewBox", "0 0 24 24");

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
    this.buffering.setAttribute("class", "buffering-circle");
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
    circle.setAttribute("class", "buffering-path");
    this.buffering.appendChild(circle);

    const element = document.createElement("div");
    element.style.marginTop = "2px";
    element.style.position = "relative";
    element.style.height = "24px";
    element.style.width = "24px";
    element.style.gridArea = "2 / 2 / 2 / 2";
    return element;
  }

  renderSelf({ playing, buffering }) {
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
    element.className = "looker-seek-bar";
    element.style.gridArea = "1 / 1 / 1 / 11";
    return element;
  }

  renderSelf({
    frameNumber,
    config: { frameRate, thumbnail },
    duration,
    buffers,
  }) {
    if (thumbnail) {
      return this.element;
    }
    const frameCount = getFrameNumber(duration, duration, frameRate);
    this.element.style.setProperty(
      "--buffer-progress",
      `${(buffers[buffers.length - 1][1] - 1) / frameCount}%`
    );
    if (duration !== null) {
      const value = ((frameNumber - 1) / frameCount) * 100;
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
    element.className = "looker-time";
    element.style.gridArea = "2 / 3 / 2 / 3";
    return element;
  }

  renderSelf({
    frameNumber,
    duration,
    config: { frameRate },
    options: { useFrameNumber },
  }) {
    const timestamp = useFrameNumber
      ? getFrameString(frameNumber, duration, frameRate)
      : getTimeString(frameNumber, frameRate, duration);
    this.element.innerHTML = timestamp;
    return this.element;
  }
}

export class VideoElement extends BaseElement<VideoState, HTMLVideoElement> {
  private src: string;
  private duration: number;
  private frameRate: number;
  private frameNumber: number = null;
  private loop: boolean;

  private requestCallback;

  getEvents(): Events<VideoState> {
    return {
      error: ({ event, dispatchEvent }) => {
        dispatchEvent("error", { event });
      },
      loadeddata: ({ update, dispatchEvent }) => {
        this.duration = this.element.duration;
        update(({ playing, options: { autoplay }, config: { frameRate } }) => {
          this.frameRate = frameRate;
          return {
            loaded: true,
            playing: autoplay || playing,
            duration: this.element.duration,
          };
        });
        dispatchEvent("load");
      },
      play: ({ update }) => {
        const callback = (newFrameNumber: number) => {
          update(
            ({
              playing,
              options: { loop },
              duration,
              config: { frameRate },
            }) => {
              this.frameNumber = newFrameNumber;

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
          ({ frameNumber, duration, config: { frameRate }, options }) => {
            frameNumber =
              frameNumber === getFrameNumber(duration, duration, frameRate)
                ? 1
                : frameNumber;

            return {
              playing: true,
              frameNumber,
            };
          },
          () => {
            this.requestCallback(callback);
          }
        );
      },
      pause: ({ update }) => {
        this.requestCallback(() => {
          update({
            frameNumber: getFrameNumber(
              this.element.currentTime,
              this.duration,
              this.frameRate
            ),
          });
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

  createHTMLElement() {
    const element = document.createElement("video");
    element.preload = "metadata";
    element.muted = true;
    this.frameNumber = 1;

    this.requestCallback = (callback: (frameNumber: number) => boolean) => {
      requestAnimationFrame((time) => {
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

  renderSelf(state) {
    const {
      options: { loop },
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
    if (this.frameNumber !== frameNumber) {
      this.element.currentTime = getTime(frameNumber, frameRate);
    }
    if (loaded && playing && !seeking && !buffering && this.element.paused) {
      this.element.play();
    }
    if (loaded && (!playing || seeking || buffering) && !this.element.paused) {
      this.element.pause();
    }

    transformWindowElement(state, this.element);
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

export class VolumBarElement extends BaseElement<VideoState, HTMLInputElement> {
  getEvents(): Events<VideoState> {
    return {
      click: ({ event }) => {
        event.stopPropagation();
      },
      input: ({ update }) => {
        const percent = this.element.valueAsNumber / 100;
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
    element.setAttribute("max", "100");
    element.className = "looker-volume";
    element.style.gridArea = "2 / 4 / 2 / 5";
    return element;
  }

  renderSelf({ options: { volume } }) {
    this.element.style.display = "block";
    this.element.style.setProperty("--volume", `${volume}%`);
    this.element.value = volume;
    return this.element;
  }
}
