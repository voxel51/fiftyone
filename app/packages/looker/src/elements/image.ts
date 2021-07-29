/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { ImageState } from "../state";
import { BaseElement, Events } from "./base";

export class ImageElement extends BaseElement<ImageState, HTMLImageElement> {
  private src: string = "";
  private imageSource: HTMLCanvasElement = document.createElement("canvas");

  getEvents(): Events<ImageState> {
    return {
      load: ({ update }) => {
        this.imageSource.width = this.element.naturalWidth;
        this.imageSource.height = this.element.naturalHeight;
        this.imageSource.getContext("2d").drawImage(this.element, 0, 0);
        delete this.element;

        update({ loaded: true });
      },
      error: ({ event, dispatchEvent }) => {
        dispatchEvent("error", { event });
      },
    };
  }

  createHTMLElement() {
    const element = new Image();
    element.loading = "eager";
    return element;
  }

  renderSelf({ config: { src } }: Readonly<ImageState>) {
    if (this.src !== src) {
      this.src = src;
      this.element.setAttribute("src", src);
    }

    return null;
  }
}
