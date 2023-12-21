import { ImaVidState } from "../../state";
import { BaseElement, Events } from "../base";
import { lookerSeekBar } from "../video.module.css";

// controls element: not shown in grid (thumbnail = off)
export class SeekBarElement extends BaseElement<ImaVidState, HTMLInputElement> {
  getEvents(): Events<ImaVidState> {
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
    element.attributes["data-cy"] = "imavid-seek-bar";
    return element;
  }

  renderSelf({
    currentFrameNumber,
    config: { thumbnail, frameStoreController },
  }: Readonly<ImaVidState>) {
    if (thumbnail) {
      return this.element;
    }

    const totalFrames = frameStoreController.totalFrameCount;
    const storeBuffer = frameStoreController.storeBufferManager;

    if (totalFrames === 0) {
      this.element.style.display = "none";
      return this.element;
    }

    const start = 0;
    const end = 100;

    this.element.style.setProperty("--start", `${start}%`);
    this.element.style.setProperty("--end", `${end}%`);

    const currentBufferRange = storeBuffer.buffers.at(
      storeBuffer.getRangeIndexForFrame(currentFrameNumber)
    );

    if (!currentBufferRange) {
      this.element.style.display = "none";
      return this.element;
    }

    const bufferValue = (currentBufferRange[1] / totalFrames) * 100;

    this.element.style.setProperty(
      "--buffer-progress",
      `${Math.min(bufferValue, end)}%`
    );

    // todo: add buffer indicator for fetch as well

    const value = ((currentFrameNumber - 1) / (totalFrames - 1)) * 100;
    this.element.style.display = "block";
    this.element.style.setProperty("--progress", `${value}%`);

    //@ts-ignore
    this.element.value = value;

    return this.element;
  }
}
