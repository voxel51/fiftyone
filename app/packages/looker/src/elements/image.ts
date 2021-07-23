/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { ImageState } from "../state";
import { BaseElement } from "./base";

export class ImageElement extends BaseElement<ImageState, HTMLImageElement> {
  private src: string = "";
  imageSource: HTMLImageElement;

  createHTMLElement(update, dispatchEvent) {
    this.imageSource = new Image();
    this.imageSource.onload = () => update({ loaded: true });
    this.imageSource.onerror = (event) => dispatchEvent("error", { event });

    return null;
  }

  renderSelf({ config: { src } }: Readonly<ImageState>) {
    if (this.src !== src) {
      this.src = src;
      this.imageSource.src = src;
    }
  }
}
