/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { getSampleSrc } from "@fiftyone/state";
import type { ImageSource, Renderer2D } from "../renderer/Renderer2D";
import type { ResourceLoader } from "../resource/ResourceLoader";
import type { Rect } from "../types";
import { BaseOverlay } from "./BaseOverlay";

/**
 * Options for creating an image overlay.
 */
export interface ImageOptions {
  src: string;
  bounds?: Rect;
  opacity?: number;
  maintainAspectRatio?: boolean;
}

/**
 * Image overlay implementation for displaying sample images.
 */
export class ImageOverlay extends BaseOverlay {
  private texture?: ImageSource;
  private originalDimensions?: { width: number; height: number };

  constructor(private options: ImageOptions) {
    const id = `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    super(id, "image", ["image", "background"]);
  }

  /**
   * Sets the resource loader for this overlay.
   * Overrides the base method to start background loading when the loader is set.
   * @param loader - The resource loader to use.
   */
  setResourceLoader(loader: ResourceLoader): void {
    super.setResourceLoader(loader);
    // Start background loading now that we have a resource loader
    // this.startBackgroundLoading();
  }

  /**
   * Starts background loading of the image texture.
   * This is called in the constructor or when the resource loader is set.
   */
  private async startBackgroundLoading(): Promise<void> {
    if (!this.resourceLoader) {
      // If resource loader isn't set yet, we'll load during render
      return;
    }

    try {
      // Use background loading for better performance with texture hint
      this.texture = await this.resourceLoader.loadBackground<Texture>(
        getSampleSrc(this.options.src),
        {
          retries: 3,
          hint: "texture",
        }
      );

      // Store original dimensions when texture is first loaded
      if (this.texture && !this.originalDimensions) {
        this.originalDimensions = {
          width: this.texture.width,
          height: this.texture.height,
        };
      }
    } catch (error) {
      console.error("Failed to background load image overlay:", error);
      this.emitError(error as Error);
    }
  }

  async render(renderer: Renderer2D): Promise<void> {
    try {
      // If texture isn't loaded yet, try to load it now (fallback)
      if (!this.texture && this.resourceLoader) {
        const rawTexture = await this.resourceLoader.load(
          getSampleSrc(this.options.src),
          {
            retries: 3,
            hint: "texture",
          }
        );

        if (!rawTexture) {
          throw new Error("Failed to load image texture");
        }

        this.texture = {
          type: "texture",
          texture: rawTexture,
        };

        // Store original dimensions when texture is first loaded
        if (this.texture && !this.originalDimensions) {
          this.originalDimensions = {
            width: this.texture.texture.width,
            height: this.texture.texture.height,
          };
        }
      }

      // Get bounds - use container dimensions if not provided
      const bounds = this.options.bounds || {
        x: 0,
        y: 0,
        width: renderer.getContainerDimensions().width,
        height: renderer.getContainerDimensions().height,
      };

      // Calculate bounds that maintain aspect ratio if requested
      const finalBounds =
        this.options.maintainAspectRatio !== false
          ? this.calculateAspectRatioBounds(bounds)
          : bounds;

      // Draw the image using the renderer
      renderer.drawImage(
        {
          type: "texture",
          texture: this.texture,
        },
        finalBounds,
        {
          opacity: this.options.opacity || 1,
        }
      );

      // Emit overlay-loaded event using the common method
      this.emitLoaded();
    } catch (error) {
      console.error("Failed to render image overlay:", error);
      this.emitError(error as Error);
      throw error;
    }
  }

  /**
   * Calculates bounds that maintain the original aspect ratio of the image.
   * @returns The calculated bounds that preserve aspect ratio.
   */
  private calculateAspectRatioBounds(bounds: Rect): Rect {
    if (!this.originalDimensions) {
      // Fallback to original bounds if we don't have texture dimensions yet
      return bounds;
    }

    const { width: originalWidth, height: originalHeight } =
      this.originalDimensions;
    const { width: targetWidth, height: targetHeight } = bounds;

    const originalAspectRatio = originalWidth / originalHeight;
    const targetAspectRatio = targetWidth / targetHeight;

    let finalWidth: number;
    let finalHeight: number;
    let offsetX = 0;
    let offsetY = 0;

    if (originalAspectRatio > targetAspectRatio) {
      // Original image is wider - fit to width
      finalWidth = targetWidth;
      finalHeight = targetWidth / originalAspectRatio;
      offsetY = (targetHeight - finalHeight) / 2;
    } else {
      // Original image is taller - fit to height
      finalHeight = targetHeight;
      finalWidth = targetHeight * originalAspectRatio;
      offsetX = (targetWidth - finalWidth) / 2;
    }

    return {
      x: bounds.x + offsetX,
      y: bounds.y + offsetY,
      width: finalWidth,
      height: finalHeight,
    };
  }

  /**
   * Gets the image source URL.
   * @returns The image source URL.
   */
  getSrc(): string {
    return this.options.src;
  }

  /**
   * Gets the opacity of the image.
   * @returns The opacity value.
   */
  getOpacity(): number {
    return this.options.opacity || 1;
  }

  /**
   * Gets the original dimensions of the image.
   * @returns The original width and height, if available.
   */
  getOriginalDimensions(): { width: number; height: number } | undefined {
    return this.originalDimensions;
  }
}
