/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { getSampleSrc } from "@fiftyone/state";
import { EventBus, LIGHTER_EVENTS } from "../event/EventBus";
import type { ImageSource, Renderer2D } from "../renderer/Renderer2D";
import type { ResourceLoader } from "../resource/ResourceLoader";
import type {
  BoundedOverlay,
  CanonicalMedia,
  DrawStyle,
  Rect,
  Dimensions,
} from "../types";
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
 * Also implements CanonicalMedia for coordinate transformations.
 */
export class ImageOverlay
  extends BaseOverlay
  implements BoundedOverlay, CanonicalMedia
{
  private texture?: ImageSource;
  private originalDimensions?: Dimensions;
  private currentBounds?: Rect;
  private resizeObserver?: ResizeObserver;
  private boundsChangeCallbacks: ((bounds: Rect) => void)[] = [];

  constructor(private options: ImageOptions) {
    const id = `image-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;
    super(id);
  }

  /**
   * Attaches the event bus to this overlay.
   * @param bus - The event bus to attach.
   */
  attachEventBus(bus: EventBus): void {
    super.attachEventBus(bus);

    // Listen for resize events from the event bus
    if (this.eventBus) {
      this.eventBus.on(LIGHTER_EVENTS.RESIZE, (event) => {
        const { width, height } = event.detail;
        this.handleResize(width, height);
      });
    }
  }

  /**
   * Sets the resource loader for this overlay.
   * Overrides the base method to start background loading when the loader is set.
   * @param loader - The resource loader to use.
   */
  setResourceLoader(loader: ResourceLoader): void {
    super.setResourceLoader(loader);

    // we could start background loading here
    // this.startBackgroundLoading();
  }

  /**
   * Sets the renderer for this overlay and sets up resize handling.
   * @param renderer - The renderer to use.
   */
  setRenderer(renderer: Renderer2D): void {
    super.setRenderer(renderer);
  }

  /**
   * Handles resize events by recalculating image bounds.
   * @param newWidth - The new width of the container.
   * @param newHeight - The new height of the container.
   */
  private handleResize(newWidth: number, newHeight: number): void {
    if (!this.renderer) return;

    // Update the current bounds to match the new container size
    this.currentBounds = {
      x: 0,
      y: 0,
      width: newWidth,
      height: newHeight,
    };

    // Mark as dirty instead of triggering re-render
    this.markDirty();

    // Notify bounds change callbacks
    this.notifyBoundsChanged();
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
      const rawTexture = await this.resourceLoader.loadBackground(
        getSampleSrc(this.options.src),
        {
          retries: 3,
          hint: "texture",
        }
      );

      this.texture = {
        type: "texture",
        texture: rawTexture,
      };

      // Store original dimensions when texture is first loaded
      if (this.texture && !this.originalDimensions) {
        // Try to get dimensions from the texture object
        const textureObj = this.texture.texture;
        if (textureObj && typeof textureObj === "object") {
          // Handle different texture types
          if ("width" in textureObj && "height" in textureObj) {
            this.originalDimensions = {
              width: (textureObj as any).width,
              height: (textureObj as any).height,
            };
          } else if (
            "naturalWidth" in textureObj &&
            "naturalHeight" in textureObj
          ) {
            this.originalDimensions = {
              width: (textureObj as any).naturalWidth,
              height: (textureObj as any).naturalHeight,
            };
          }
        }
      }
    } catch (error) {
      console.error("Failed to background load image overlay:", error);
      this.emitError(error as Error);
    }
  }

  async render(renderer: Renderer2D, style: DrawStyle): Promise<void> {
    renderer.dispose(this.id);

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
          const textureObj = this.texture.texture;
          if (textureObj && typeof textureObj === "object") {
            // Handle different texture types
            if ("width" in textureObj && "height" in textureObj) {
              this.originalDimensions = {
                width: (textureObj as any).width,
                height: (textureObj as any).height,
              };
            } else if (
              "naturalWidth" in textureObj &&
              "naturalHeight" in textureObj
            ) {
              this.originalDimensions = {
                width: (textureObj as any).naturalWidth,
                height: (textureObj as any).naturalHeight,
              };
            }
          }
        }
      }

      // Get bounds - use current bounds from resize handling, then fallback to options, then container dimensions
      const bounds = this.currentBounds ||
        this.options.bounds || {
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

      // Update current bounds to reflect the actual rendered bounds
      this.currentBounds = finalBounds;

      // Draw the image using the renderer
      renderer.drawImage(
        {
          type: "texture",
          texture: this.texture,
        },
        finalBounds,
        {
          opacity: this.options.opacity || 1,
        },
        this.id
      );

      // Emit overlay-loaded event using the common method
      this.emitLoaded();

      // Notify bounds change callbacks after rendering
      this.notifyBoundsChanged();
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

  // CanonicalMedia interface implementation

  /**
   * Get the original dimensions of the image.
   */
  getOriginalDimensions(): Dimensions {
    return this.originalDimensions || { width: 1, height: 1 };
  }

  /**
   * Get the current rendered bounds of the image in the canvas.
   */
  getRenderedBounds(): Rect {
    return this.currentBounds || { x: 0, y: 0, width: 0, height: 0 };
  }

  /**
   * Get the aspect ratio of the image.
   */
  getAspectRatio(): number {
    const dims = this.getOriginalDimensions();
    return dims.width / dims.height;
  }

  /**
   * Register a callback for bounds changes.
   * @returns Unsubscribe function
   */
  onBoundsChanged(callback: (bounds: Rect) => void): () => void {
    this.boundsChangeCallbacks.push(callback);

    // Immediately call with current bounds if available
    if (this.currentBounds) {
      callback(this.currentBounds);
    }

    return () => {
      const index = this.boundsChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.boundsChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Force update the bounds calculation.
   */
  updateBounds(): void {
    if (this.renderer) {
      const containerDimensions = this.renderer.getContainerDimensions();
      if (
        containerDimensions &&
        containerDimensions.width > 0 &&
        containerDimensions.height > 0
      ) {
        const bounds = {
          x: 0,
          y: 0,
          width: containerDimensions.width,
          height: containerDimensions.height,
        };

        const finalBounds =
          this.options.maintainAspectRatio !== false
            ? this.calculateAspectRatioBounds(bounds)
            : bounds;

        this.currentBounds = finalBounds;
        this.notifyBoundsChanged();
      }
    }
  }

  /**
   * Notify all callbacks of bounds change.
   */
  private notifyBoundsChanged(): void {
    if (!this.currentBounds) return;

    this.boundsChangeCallbacks.forEach((callback) => {
      try {
        callback(this.currentBounds!);
      } catch (error) {
        console.error("Error in bounds change callback:", error);
      }
    });
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
   * Gets the current bounds of the image.
   * @returns The current bounds, if available.
   */
  getCurrentBounds(): Rect | undefined {
    return this.currentBounds;
  }

  /**
   * Updates the image bounds manually.
   * @param bounds - The new bounds for the image.
   */
  setBounds(bounds: Rect): void {
    this.currentBounds = bounds;
    this.markDirty();
    this.notifyBoundsChanged();
  }

  /**
   * Forces the overlay to recalculate and update its current bounds.
   * This is useful when the container dimensions change and we need to ensure
   * the bounds are updated for coordinate transformations.
   */
  forceUpdateBounds(): void {
    this.updateBounds();
  }

  /**
   * Cleanup method to remove resize observer when overlay is destroyed.
   */
  destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    }
    this.boundsChangeCallbacks = [];
  }
}
