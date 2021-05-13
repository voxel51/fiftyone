/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseElement } from "./base";
import {
  getFrameNumber,
  getFrameString,
  getTime,
  getTimeString,
  ICONS,
  makeCheckboxRow,
  makeWrapper,
} from "./util";

export class PlayButtonElement extends BaseElement {
  element: HTMLImageElement;
  private playing: boolean = false;

  events = {
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

export class SeekBarElement extends BaseElement {
  events = {
    change: ({ event, update }) => {
      update(({ duration, config: { frameRate } }) => {
        const progress = event.target.valueAsNumber / 100;
        return {
          locked: false,
          frameNumber: getFrameNumber(duration * progress, duration, frameRate),
        };
      });
    },
    mousedown: ({ update }) =>
      update({
        seeking: true,
        locked: false,
      }),

    mouseup: ({ event }) => {
      const progress = event.target.valueAsNumber / 100;

      // Play the video when the seek handle is dropped
      this.eleSeekBar.addEventListener("mouseup", function (e) {
        self._boolManualSeek = false;
        if (self._boolPlaying && self.eleVideo.paused) {
          // Calculate the new time
          const seekRect = self.eleSeekBar.getBoundingClientRect();
          const time =
            self.eleVideo.duration *
            ((e.clientX - seekRect.left) / seekRect.width);
          // Update the video time
          self.eleVideo.currentTime = self.clampTimeToFrameStart(time);
          self.eleSeekBar.value =
            (time / self.eleVideo.duration) * self.seekBarMax;
          self.eleVideo.play();
        }
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

export class UseFrameNumberOptionElement extends BaseElement {
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

export class TimeElement extends BaseElement {
  createHTMLElement() {
    const element = document.createElement("div");
    element.className = "p51-time";
    element.style.gridArea = "2 / 3 / 2 / 3";
    return element;
  }

  renderSelf({
    currentTime,
    duration,
    frameRate,
    options: { useFrameNumber },
  }) {
    const timestamp = useFrameNumber
      ? getFrameString(currentTime, duration, frameRate)
      : getTimeString(currentTime, duration);
    this.element.innerHTML = timestamp;
    return this.element;
  }
}

export class VideoElement extends BaseElement {
  events = {
    error: ({ event, update, dispatchEvent }) => {
      update({ errors: event.error });

      dispatchEvent("error");
    },
    loadedmetadata: ({ update }) => {
      update({ loadedMetadata: true });
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
        update(({ seeking, config: { frameRate } }) => {
          if (!seeking) {
            window.requestAnimationFrame(callback);
          }

          return {
            frameNumber: getFrameNumber(
              event.target.currentTime,
              event.target.duration,
              frameRate
            ),
          };
        });
      };
    },
    pause: ({ event, update }) => {
      update(({ playing, seeking, slice }) => {
        if (playing && !seeking && !Boolean(slice) && !event.target.ended) {
          event.target.play();
        }
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
      update(({ config: { frameRate } }) => {
        dispatchEvent("timeupdate", {
          frameNumber: getFrameNumber(
            event.target.currentTime,
            event.target.duration,
            frameRate
          ),
        });
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

  renderSelf({ config: { src } }) {
    this.element.setAttribute("src", src);
    return this.element;
  }
}
