/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { ImageState } from "../state";
import { BaseElement, Events } from "./base";
import { transformWindowElement } from "./util";

import { mediaOrCanvas, mediaLoading } from "./media.module.css";

export class ImageElement extends BaseElement<ImageState, HTMLImageElement> {
  private src: string = "";
  private loaded: boolean = false;

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
    element.classList.add(mediaOrCanvas, mediaLoading);
    element.loading = "lazy";
    return element;
  }

  renderSelf(state: Readonly<ImageState>) {
    const {
      loaded,
      config: { src },
    } = state;

    if (this.src !== src) {
      this.src = src;
      this.element.setAttribute("src", src);
    }

    if (this.loaded !== loaded) {
      this.element.classList.remove(mediaLoading);
      this.loaded = loaded;
    }

    transformWindowElement(state, this.element);
    return this.element;
  }
}
