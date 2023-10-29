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
    return element;
  }

  renderSelf({
    currentFrameNumber: frameNumber,
    config: { frameRate, thumbnail },
    duration,
    bufferManager: buffers,
  }: Readonly<ImaVidState>) {
    if (thumbnail) {
      return this.element;
    }

    if (duration !== null) {
      const frameCount = getFrameNumber(duration, duration, frameRate);
      const start = 0;

      this.element.style.setProperty("--start", `${start}%`);

      const end = 100;

      this.element.style.setProperty("--end", `${end}%`);
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

      this.element.style.setProperty(
        "--buffer-progress",
        `${Math.min(bufferValue, end)}%`
      );
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
