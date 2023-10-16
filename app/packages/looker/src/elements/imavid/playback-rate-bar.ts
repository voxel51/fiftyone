import { ImaVidState } from "../../state";
import { BaseElement, Events } from "..//base";

export class PlaybackRateBarElement extends BaseElement<
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
