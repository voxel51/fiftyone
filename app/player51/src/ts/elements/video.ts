/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { VideoState } from "../state";
import { BaseElement, Events } from "./base";
import {
  getFrameNumber,
  getFrameString,
  getTime,
  getTimeString,
  ICONS,
  makeCheckboxRow,
  makeWrapper,
} from "./util";

export class PlayButtonElement extends BaseElement<VideoState> {
  element: HTMLImageElement;
  private playing: boolean = false;

  events: Events<VideoState> = {
    change: ({ event, update }) => {
      event.stopPropagation();
      update(({ playing }) => ({ playing: !playing }));
    },
  };

  createHTMLElement() {
    const element = document.createElement("img");
    element.className = "p51-clickable";
    element.style.gridArea = "2 / 2 / 2 / 2";
    return element;
  }

  renderSelf({ playing }) {
    if (playing !== this.playing) {
      if (playing) {
        this.element.src = ICONS.pause;
        this.element.title = "Pause (space)";
      } else {
        this.element.src = ICONS.pause;
        this.element.title = "Pause (space)";
      }
      this.playing = playing;
    }
    return this.element;
  }
}

export class SeekBarElement extends BaseElement<VideoState> {
  events: Events<VideoState> = {
    input: ({ event, update }) => {
      const progress = event.target.valueAsNumber / 100;
      update(({ duration, config: { frameRate } }) => {
        return {
          frameNumber: getFrameNumber(duration * progress, duration, frameRate),
        };
      });
    },
    mousedown: ({ update }) =>
      update({
        locked: false,
        seeking: true,
      }),

    mouseup: ({ event, update }) => {
      const progress = event.target.valueAsNumber / 100;
      update(({ duration, config: { frameRate } }) => {
        return {
          frameNumber: getFrameNumber(duration * progress, duration, frameRate),
        };
      });
    },
  };

  createHTMLElement() {
    const element = document.createElement("input");
    element.setAttribute("type", "range");
    element.setAttribute("min", "0");
    element.setAttribute("max", "100");
    element.className = "p51-seek-bar";
    element.style.gridArea = "1 / 2 / 1 / 6";
    return element;
  }

  renderSelf({ frameNumber, config: { frameRate } }) {
    this.element.setAttribute(
      "value",
      getTime(frameNumber, frameRate).toString()
    );
    return this.element;
  }
}

export class UseFrameNumberOptionElement extends BaseElement<VideoState> {
  checkbox: HTMLInputElement;
  label: HTMLLabelElement;

  createHTMLElement() {
    [this.label, this.checkbox] = makeCheckboxRow("Use frame number", false);
    return makeWrapper([this.label]);
  }

  renderSelf({ options: { useFrameNumber } }) {
    this.checkbox.checked = useFrameNumber;
    return this.element;
  }
}

export class TimeElement extends BaseElement<VideoState> {
  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "p51-time";
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

  events: Events<VideoState> = {
    keydown: ({ event, update }) => {
      if (event.keyCode === 32) {
        update(({ playing }) => {
          return {
            playing: !playing,
          };
        });
      }

      if (event.keyCode === 37) {
        // left arrow
        update(({ frameNumber, locked, fragment, playing }) => {
          if (!playing) {
            return;
          }
          const limit = locked && fragment ? fragment[0] : 1;
          return { frameNumber: Math.max(limit, frameNumber - 1) };
        });
      }

      if (event.keyCode === 39) {
        // right arrow
        update(
          ({
            frameNumber,
            duration,
            locked,
            fragment,
            playing,
            config: { frameRate },
          }) => {
            if (!playing) {
              return;
            }
            const limit =
              locked && fragment
                ? fragment[1]
                : getFrameNumber(duration, duration, frameRate);
            return { frameNumber: Math.max(limit, frameNumber + 1) };
          }
        );
      }
    },
    mouseenter: ({ update }) => {
      update(({ loaded, config: { thumbnail } }) => {
        if (thumbnail && loaded) {
          return {
            playing: true,
          };
        }
      });
    },
    mouseleave: ({ update }) => {
      update(({ loaded, config: { thumbnail } }) => {
        if (thumbnail && loaded) {
          return {
            playing: false,
          };
        }
      });
    },
    error: ({ event, dispatchEvent }) => {
      dispatchEvent("error", { event });
    },
    loadedmetadata: ({ update }) => {
      update({ loaded: true });
    },
    loadeddata: ({ update, dispatchEvent }) => {
      update(({ playing, options: { autoplay } }) => ({
        loaded: true,
        playing: autoplay || playing,
      }));
      dispatchEvent("load");
    },
    play: ({ event, update }) => {
      const callback = () => {
        update(
          ({
            duration,
            seeking,
            locked,
            fragment,
            config: { frameRate },
            options: { loop },
          }) => {
            if (!seeking) {
              window.requestAnimationFrame(callback);
            }
            let newFrameNumber = getFrameNumber(
              event.target.currentTime,
              duration,
              frameRate
            );

            const resetToFragment =
              locked && fragment && newFrameNumber > fragment[1];
            if (!resetToFragment) {
              this.frameNumber = newFrameNumber;
            } else {
              newFrameNumber = fragment[0];
            }

            return {
              frameNumber: newFrameNumber,
              playing: !(resetToFragment && !loop),
            };
          }
        );
      };

      requestAnimationFrame(callback);
    },
    pause: ({ event, update }) => {
      update(({ playing, seeking, fragment }) => {
        if (playing && !seeking && !Boolean(fragment) && !event.target.ended) {
          event.target.play();
        }
        return {};
      });
    },
    seeked: ({ event, update }) => {
      update(({ config: { frameRate } }) => {
        return {
          frameNumber: getFrameNumber(
            event.target.currentTime,
            event.target.duration,
            frameRate
          ),
        };
      });
    },
    timeupdate: ({ event, dispatchEvent, update }) => {
      update(({ duration, config: { frameRate } }) => {
        dispatchEvent("timeupdate", {
          frameNumber: getFrameNumber(
            event.target.currentTime,
            duration,
            frameRate
          ),
        });

        return {};
      });
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
  };

  createHTMLElement() {
    const element = document.createElement("video");
    element.className = "p51-video";
    element.setAttribute("preload", "metadata");
    element.muted = true; // this works whereas .setAttribute does not
    return element;
  }

  renderSelf({ config: { src }, frameNumber, seeking }) {
    if (this.src !== src) {
      this.src = src;
      this.element.setAttribute("src", src);
    }
    if (this.frameNumber !== frameNumber) {
      this.element.currentTime = frameNumber;
    }
    if (seeking && this.element.playin) return this.element;
  }
}
