/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { ImageState } from "../state";
import { BaseElement, Events } from "./base";
import { transformWindowElement } from "./util";

export class ImageElement extends BaseElement<ImageState, HTMLImageElement> {
  private src: string;

  getEvents(): Events<ImageState> {
    return {
      load: ({ update }) => {
        update({ loaded: true });
      },
      error: ({ event, dispatchEvent }) => {
        dispatchEvent("error", { event });
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("img");
    element.className = "looker-image";
    element.loading = "lazy";
    return element;
  }

  renderSelf(state) {
    const {
      config: { src },
    } = state;
    if (this.src !== src) {
      this.src = src;
      this.element.setAttribute("src", src);
    }
    transformWindowElement(state, this.element);
    return this.element;
  }
}
