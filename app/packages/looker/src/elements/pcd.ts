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
      // could be either pcd or projection
      let isPcd = false;

      if (src.endsWith(".pcd") || src.split("?")[0].endsWith(".pcd")) {
        // split("?")[0] is to remove query params, if any, from signed urls
        isPcd = true;
      }

      if (isPcd) {
        // this means orthographic projections have not been computed, replace with a 1x1 base64 blank image
        const base64Blank =
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWNgYGD4DwABDQF/w6a5YwAAAABJRU5ErkJggg==";
        this.src = base64Blank;
        this.element.setAttribute("src", base64Blank);
        return;
      }

      this.src = src;

      this.element.setAttribute("src", src);
    }

    return null;
  }
}
