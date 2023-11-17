import { Control, ImaVidState } from "../../state";
import { BaseElement, Events } from "../base";
import { lookerPlaybackRate } from "../video.module.css";
import { lookerClickable } from "../common/controls.module.css";
import { playbackRate } from "../../icons";

const resetPlaybackRate: Control<ImaVidState> = {
  title: "Reset playback rate",
  shortcut: "p",
  detail: "Reset the video's playback rate",
  action: (update, dispatchEvent) => {
    update(({ config: { thumbnail } }) => {
      if (thumbnail) {
        return {};
      }

      dispatchEvent("options", { playbackRate: 1 });

      return {
        options: { playbackRate: 1 },
      };
    });
  },
};

class PlaybackRateContainerElement extends BaseElement<
  ImaVidState,
  HTMLDivElement
> {
  getEvents(): Events<ImaVidState> {
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

class PlaybackRateBarElement extends BaseElement<
  ImaVidState,
  HTMLInputElement
> {
  private playbackRate: number;

  getEvents(): Events<ImaVidState> {
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
  }: Readonly<ImaVidState>) {
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

class PlaybackRateIconElement extends BaseElement<ImaVidState, HTMLDivElement> {
  getEvents(): Events<ImaVidState> {
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

export const IMAVID_PLAYBACK_RATE = {
  node: PlaybackRateContainerElement,
  children: [
    { node: PlaybackRateIconElement },
    { node: PlaybackRateBarElement },
  ],
};
