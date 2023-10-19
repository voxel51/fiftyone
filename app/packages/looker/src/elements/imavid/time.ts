import { ImaVidState } from "../../state";
import { BaseElement } from "..//base";
import { lookerTime } from "../common/controls.module.css";

// controls element: not shown in grid (thumbnail = off)
export class TimeElement extends BaseElement<ImaVidState> {
  createHTMLElement() {
    const element = document.createElement("div");
    element.setAttribute("data-cy", "looker-video-time");
    element.classList.add(lookerTime);
    element.style.gridArea = "2 / 5 / 2 / 5";
    return element;
  }

  renderSelf({
    currentFrameNumber: frameNumber,
    duration,
    config,
    options: { useFrameNumber },
  }: Readonly<ImaVidState>) {
    if (typeof duration !== "number") {
      this.element.innerHTML = "";
      return this.element;
    }

    // const timestamp = useFrameNumber
    //   ? getFrameString(frameNumber, duration, frameRate)
    //   : getFullTimeString(frameNumber, frameRate, duration);
    // this.element.innerHTML = timestamp;
    this.element.innerText = "timestamp";
    return this.element;
  }
}
