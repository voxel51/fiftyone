/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import { update } from "immutable";
import { ImageState } from "../state";
import { BaseElement, Events } from "./base";

export class ImageElement extends BaseElement<ImageState, HTMLImageElement> {
  private src: string = "";
  private imageSource: HTMLImageElement;

  getEvents(): Events<ImageState> {
    return {
      load: ({ update }) => {
        this.imageSource = this.element;

        update({
          loaded: true,
          dimensions: [this.element.naturalWidth, this.element.naturalHeight],
        });
      },
      error: ({ update }) => {
        update({ error: true, dimensions: [512, 512], loaded: true });
      },
    };
  }

  createHTMLElement() {
    const element = new Image();
    element.crossOrigin = "Anonymous";
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
