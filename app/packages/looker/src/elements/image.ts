/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import type { ImageState } from "../state";
import type { Events } from "./base";
import { BaseElement } from "./base";

export class ImageElement extends BaseElement<ImageState, HTMLImageElement> {
  // Teams only
  private allowAnonymousOrigin: boolean;
  private customCredentialsAudience: string | null = null;

  private src = "";
  private imageSource: HTMLImageElement;

  constructor() {
    super();
    this.allowAnonymousOrigin = window.LOOKER_CROSS_ORIGIN_MEDIA;
    const customCredentialsAudience = sessionStorage.getItem(
      "customCredentialsAudience"
    );
    if (customCredentialsAudience) {
      this.customCredentialsAudience = customCredentialsAudience;
    }
  }

  getEvents(): Events<ImageState> {
    return {
      load: ({ update }) => {
        this.imageSource = this.element;
        console.log("this.imageSource.src=", this.imageSource.src);

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
    if (this.allowAnonymousOrigin) {
      element.crossOrigin = "Anonymous";
    }
    element.loading = "eager";
    return element;
  }

  renderSelf({ config: { src } }: Readonly<ImageState>) {
    if (this.src !== src) {
      this.src = src;
      if (
        this.customCredentialsAudience &&
        src.includes(this.customCredentialsAudience)
      ) {
        console.log("setting crossOrigin=Anonymous");
        this.element.setAttribute("crossOrigin", "Anonymous");
      }
      this.element.setAttribute("src", src);
    }

    return null;
  }
}
