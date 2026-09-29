import { ImaVidState } from "../../state";
import { BaseElement } from "../base";
import {
  createBufferingIndicator,
  setBufferingShown,
} from "../common/buffering";

export class LoaderBar extends BaseElement<ImaVidState> {
  private buffering = false;

  isShown({ thumbnail }: Readonly<ImaVidState["config"]>) {
    return thumbnail;
  }

  createHTMLElement() {
    const element = createBufferingIndicator();
    element.setAttribute("data-cy", "imavid-loader-bar");
    return element;
  }

  renderSelf({ buffering, hovering, error }: Readonly<ImaVidState>) {
    this.buffering = buffering && hovering && !error;
    setBufferingShown(this.element, this.buffering);
    return this.element;
  }
}
