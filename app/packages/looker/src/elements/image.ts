/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import type { ImageState } from "../state";
import type { Events } from "./base";
import { BaseElement } from "./base";

export class ImageElement extends BaseElement<ImageState, HTMLImageElement> {
  private src = "";
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
