/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { ImageState } from "../state";
import { BaseElement, Events } from "./base";

export class ImageElement extends BaseElement<ImageState> {
  private src: string;

  events: Events<ImageState> = {
    load: ({ update }) => {
      update({ loaded: true });
    },
    error: ({ event, dispatchEvent }) => {
      dispatchEvent("error", { event });
    },
  };

  createHTMLElement() {
    const element = document.createElement("img");
    element.className = "p51-image";
    element.setAttribute("loading", "lazy");
    return element;
  }

  renderSelf({ config: { src } }) {
    this.element.setAttribute("src", src);
    return this.element;
  }
}
