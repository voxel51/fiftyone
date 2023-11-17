import { ImaVidState } from "../../state";
import { BaseElement } from "../base";
import { lookerTime } from "../common/controls.module.css";

export class FrameCountElement extends BaseElement<ImaVidState> {
  createHTMLElement() {
    const element = document.createElement("div");
    element.setAttribute("data-cy", "looker-video-time");
    element.classList.add(lookerTime);
    element.style.gridArea = "2 / 5 / 2 / 5";
    return element;
  }

  renderSelf({ currentFrameNumber, config }: Readonly<ImaVidState>) {
    this.element.innerHTML = `${currentFrameNumber} / ${config.frameStoreController.totalFrameCount}`;
    return this.element;
  }
}
