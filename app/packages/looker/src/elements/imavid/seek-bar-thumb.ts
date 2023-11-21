import { ImaVidState } from "../../state";
import { BaseElement, Events } from "../base";
import { getFrameNumber } from "../util";

import { lookerThumb, lookerThumbSeeking } from "../video.module.css";

// controls element: not shown in grid (thumbnail = off)
export class SeekBarThumbElement extends BaseElement<
  ImaVidState,
  HTMLDivElement
> {
  private active: boolean;

  getEvents(): Events<ImaVidState> {
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
    currentFrameNumber,
    config: { frameStoreController },
  }: Readonly<ImaVidState>) {
    const totalFrames = frameStoreController.totalFrameCount;

    if (totalFrames === 0) {
      return this.element;
    }

    const value = ((currentFrameNumber - 1) / (totalFrames - 1)) * 100;
    this.element.style.setProperty(
      "--progress",
      `${Math.max(0, value - 0.5)}%`
    );
    //@ts-ignore
    this.element.value = value;

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
