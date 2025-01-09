/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import type { ImageState } from "../state";
import type { Events } from "./base";
import { BaseElement } from "./base";

const MAX_IMAGE_LOAD_RETRIES = 10;

export class ImageElement extends BaseElement<ImageState, HTMLImageElement> {
  // Teams only
  // For matching the url to determine if we should add crossOrigin="Anonymous"
  // which is required for fetching images with service-worker injected custom credentials
  private customCredentialsAudience: string | null = null;

  private src = "";
  protected imageSource: HTMLImageElement;

  private retryCount = 0;
  private timeoutId: number | null = null;

  constructor() {
    super();
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
        if (this.timeoutId !== null) {
          window.clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }
        this.retryCount = 0;

        this.imageSource = this.element;

        update({
          loaded: true,
          error: false,
          dimensions: [this.element.naturalWidth, this.element.naturalHeight],
        });
      },
      error: ({ update }) => {
        update({ error: true, dimensions: [512, 512], loaded: true });
        // sometimes image loading fails because of insufficient resources
        // we'll want to try again in those cases
        if (this.retryCount < MAX_IMAGE_LOAD_RETRIES) {
          // schedule a retry after a delay
          if (this.timeoutId !== null) {
            window.clearTimeout(this.timeoutId);
          }
          this.timeoutId = window.setTimeout(() => {
            this.retryCount += 1;
            const retrySrc = `${this.src}`;
            this.element.setAttribute("src", retrySrc);
            // linear backoff
          }, 1000 * this.retryCount);
        }
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
      this.retryCount = 0;
      if (this.timeoutId !== null) {
        window.clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
      if (
        this.customCredentialsAudience &&
        src.includes(this.customCredentialsAudience)
      ) {
        this.element.setAttribute("crossOrigin", "Anonymous");
      }
      this.element.setAttribute("src", src);
    }
    return null;
  }
}
