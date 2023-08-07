/**
 * Copyright 2017-2023, Voxel51, Inc.
 */

import { PcdState, StateUpdate } from "../state";
import { BaseElement, Events } from "./base";

export class PcdElement extends BaseElement<PcdState, HTMLImageElement> {
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

  createHTMLElement(
    _: StateUpdate<PcdState>,
    __: (_: string, details) => void,
    { src }: Readonly<PcdState["config"]>
  ) {
    const element = new Image();
    element.crossOrigin = "Anonymous";
    element.loading = "eager";

    // split("?")[0] is to remove query params, if any, from signed urls
    if (src.endsWith(".pcd") || src.split("?")[0].endsWith(".pcd")) {
      // this means orthographic projections have not been computed, replace with a 1x1 base64 blank image
      src =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWNgYGD4DwABDQF/w6a5YwAAAABJRU5ErkJggg==";
    }

    element.setAttribute("src", src);
    return element;
  }

  renderSelf(_: Readonly<PcdState>) {
    return this.element;
  }
}
