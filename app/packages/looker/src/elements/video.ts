/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { VideoState } from "../state";
import { BaseElement, Events } from "./base";
import { VIDEO_SHORTCUTS } from "./common/actions";
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
    return element;
  }

  renderSelf({ buffering }) {
    if (buffering === this.buffering) {
      return this.element;
    }
    this.buffering = buffering;

    if (buffering) {
      this.element.style.display = "block";
    } else {
      this.element.style.display = "none";
    }
    return this.element;
  }
}

export class PlayButtonElement extends BaseElement<VideoState, HTMLDivElement> {
  private playing: boolean;
  private play: SVGElement;
  private pause: SVGElement;
  private buffering: SVGElement;

  getEvents(): Events<VideoState> {
    return {
      click: ({ event, update }) => {
        event.preventDefault();
        event.stopPropagation();
        update(({ buffering, playing }) => {
          if (buffering) {
            return {};
          }
          if (playing) {
            return { playing: !playing, showOptions: false };
          }
        });
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

  renderSelf({ playing }) {
    if (playing !== this.playing) {
      this.element.innerHTML = "";
      if (this.buffering) {
        this.element.appendChild(this.buffering);
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
      this.playing = playing;
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

  renderSelf({ frameNumber, config: { frameRate, thumbnail }, duration }) {
    if (thumbnail) {
      return this.element;
    }
    if (duration !== null) {
      const value =
        ((frameNumber - 1) / Math.max(frameRate * duration - 1, 1)) * 100;
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
  private frameNumber: number;

  getEvents(): Events<VideoState> {
    return {
      error: ({ event, dispatchEvent }) => {
        dispatchEvent("error", { event });
      },
      loadeddata: ({ update, dispatchEvent }) => {
        update(({ playing, options: { autoplay } }) => {
          return {
            loaded: true,
            playing: autoplay || playing,
            duration: this.element.duration,
          };
        });
        dispatchEvent("load");
      },
      play: ({ event, update }) => {
        const target = event.target as HTMLVideoElement;
        const callback = () => {
          update(
            ({
              playing,
              frameNumber,
              duration,
              locked,
              fragment,
              config: { frameRate },
              options: { loop },
            }) => {
              let newFrameNumber = getFrameNumber(
                target.currentTime,
                duration,
                frameRate
              );

              const resetToFragment =
                locked && fragment && newFrameNumber > fragment[1];
              if (!resetToFragment) {
                this.frameNumber = newFrameNumber;
              } else if (loop) {
                newFrameNumber = fragment[0];
              }

              return {
                frameNumber: newFrameNumber,
                playing: resetToFragment ? (loop ? true : false) : playing,
              };
            },
            ({ buffering, seeking, playing }) => {
              if (!seeking && !buffering && playing) {
                requestAnimationFrame(callback);
              }
            }
          );
        };

        requestAnimationFrame(callback);
      },
      ended: ({ update }) => {
        update(({ locked, fragment, options: { loop } }) => {
          if (loop) {
            return {
              frameNumber: locked && fragment ? fragment[0] : 1,
              playing: true,
            };
          } else {
            return {
              playing: false,
            };
          }
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
    return element;
  }

  renderSelf(state) {
    const {
      config: { src, frameRate },
      frameNumber,
      seeking,
      playing,
      loaded,
      buffering,
    } = state;
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
              buffering: true,
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
