/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import { PcdState, Sample } from "../state";
import { BaseElement, Events } from "./base";

export class PcdElement extends BaseElement<PcdState, HTMLImageElement> {
  private src: string = "";
  private imageSource: HTMLImageElement;

  getEvents(): Events<PcdState> {
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

  renderSelf({ config: { src } }: Readonly<PcdState>) {
    if (this.src !== src) {
      this.src = src;

      this.element.setAttribute("src", src);
    }

    return null;
  }
}
