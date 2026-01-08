/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { getEventBus, type EventDispatcher } from "@fiftyone/events";
import { getSampleSrc } from "@fiftyone/state";
import type { LighterEventGroup } from "../events";
import type { Renderer2D } from "../renderer/Renderer2D";
import type {
  BoundedOverlay,
  CanonicalMedia,
  Dimensions,
  Rect,
  RenderMeta,
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
  field?: string;
}

const isRectNonEmpty = (bounds: Rect | undefined): boolean => {
  if (!bounds) return false;
  return bounds.width > 0 && bounds.height > 0;
};

/**
 * Image overlay implementation for displaying sample images.
 * Uses an HTML <img> element instead of Pixi textures to avoid CORS requirements.
 * Also implements CanonicalMedia for coordinate transformations.
 */
export class ImageOverlay
  extends BaseOverlay
  implements BoundedOverlay, CanonicalMedia
{
  private imgElement?: HTMLImageElement;
  private originalDimensions?: Dimensions;
  private currentBounds?: Rect;
  private resizeObserver?: ResizeObserver;
  private boundsChangeCallbacks: ((bounds: Rect) => void)[] = [];
  private viewportUnsubscribe?: () => void;
  private sceneEventBus?: EventDispatcher<LighterEventGroup>;
  private isImageLoaded = false;

  constructor(private options: ImageOptions) {
    const id = `image-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;
    super(id, "", null);
  }

  getOverlayType(): string {
    return "ImageOverlay";
  }

  /**
   * Sets the scene ID for this overlay and subscribes to viewport events.
   * @param sceneId - The scene ID to use for the event bus channel.
   */
  setSceneId(sceneId: string | undefined): void {
    super.setSceneId(sceneId);

    // Clean up previous subscription
    if (this.viewportUnsubscribe) {
      this.viewportUnsubscribe();
      this.viewportUnsubscribe = undefined;
    }

    if (sceneId) {
      this.sceneEventBus = getEventBus<LighterEventGroup>(sceneId);

      // Subscribe to viewport-moved events to sync image transform
      this.viewportUnsubscribe = this.sceneEventBus.on(
        "lighter:viewport-moved",
        (event) => {
          this.updateImageTransform(event.x, event.y, event.scale);
        }
      );
    }
  }

  /**
   * Sets the renderer for this overlay and sets up resize handling.
   * @param renderer - The renderer to use.
   */
  setRenderer(renderer: Renderer2D): void {
    super.setRenderer(renderer);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    }

    const canvas = renderer.getCanvas();
    const parentElement = canvas.parentElement;

    if (parentElement) {
      if (!this.imgElement) {
        this.createImageElement(parentElement);
      } else if (this.imgElement.parentElement !== parentElement) {
        // Migrate existing element to new parent
        const targetCanvas = parentElement.querySelector("canvas");
        if (targetCanvas) {
          targetCanvas.style.position = "relative";
          targetCanvas.style.zIndex = "1";
          parentElement.insertBefore(this.imgElement, targetCanvas);
        } else {
          parentElement.appendChild(this.imgElement);
        }
      }
    }

    if (parentElement) {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          this.handleResize(width, height);
        }
      });
      this.resizeObserver.observe(parentElement);
    }
  }

  /**
   * Creates the HTML image element and appends it to the container.
   * @param container - The container element to append the image to.
   */
  private createImageElement(container: HTMLElement): void {
    this.imgElement = document.createElement("img");
    this.imgElement.setAttribute("data-cy", "lighter-sample-image");

    // Note: No CORS requirement
    const src = getSampleSrc(this.options.src);
    if (!src) {
      console.error("Invalid sample source:", this.options.src);
      this.emitError(new Error(`Invalid sample source: ${this.options.src}`));
      return;
    }
    this.imgElement.src = src;

    this.imgElement.style.position = "absolute";
    this.imgElement.style.top = "0";
    this.imgElement.style.left = "0";
    this.imgElement.style.transformOrigin = "0 0";
    this.imgElement.style.pointerEvents = "none";
    this.imgElement.style.userSelect = "none";
    this.imgElement.style.zIndex = "0";
    this.imgElement.draggable = false;

    if (this.options.opacity !== undefined && this.options.opacity !== 1) {
      this.imgElement.style.opacity = String(this.options.opacity);
    }

    // Handle image load to get dimensions
    this.imgElement.onload = () => {
      if (this.imgElement && !this.isImageLoaded) {
        this.originalDimensions = {
          width: this.imgElement.naturalWidth,
          height: this.imgElement.naturalHeight,
        };
        this.isImageLoaded = true;

        // Trigger initial layout
        if (this.renderer) {
          const dims = this.renderer.getContainerDimensions();
          this.handleResize(dims.width, dims.height);
        }

        this.emitLoaded();
      }
    };

    this.imgElement.onerror = (error) => {
      console.error("Failed to load image:", error);
      this.emitError(new Error(`Failed to load image: ${this.options.src}`));
    };

    // Insert the image as the first child to ensure it's in the background
    // Also ensure proper z-index stacking
    const canvas = container.querySelector("canvas");
    if (canvas) {
      // Ensure canvas is on top of the image
      canvas.style.position = "relative";
      canvas.style.zIndex = "1";
      container.insertBefore(this.imgElement, canvas);
    } else {
      container.appendChild(this.imgElement);
    }
  }

  /**
   * Updates the image element's CSS transform to match the viewport.
   * @param viewportX - The viewport's X position.
   * @param viewportY - The viewport's Y position.
   * @param scale - The viewport's scale factor.
   */
  private updateImageTransform(
    viewportX: number,
    viewportY: number,
    scale: number
  ): void {
    if (!this.imgElement || !this.isImageLoaded) return;

    const bounds = this.currentBounds;
    if (!bounds) return;

    // Calculate the transformed position based on viewport
    const transformedX = bounds.x * scale + viewportX;
    const transformedY = bounds.y * scale + viewportY;
    const transformedWidth = bounds.width * scale;
    const transformedHeight = bounds.height * scale;

    this.imgElement.style.transform = `translate(${transformedX}px, ${transformedY}px)`;
    this.imgElement.style.width = `${transformedWidth}px`;
    this.imgElement.style.height = `${transformedHeight}px`;
  }

  /**
   * Handles resize events by recalculating image bounds.
   * @param newWidth - The new width of the container.
   * @param newHeight - The new height of the container.
   */
  private handleResize(newWidth: number, newHeight: number): void {
    if (!this.renderer) return;

    const containerBounds = {
      x: 0,
      y: 0,
      width: newWidth,
      height: newHeight,
    };

    // Calculate bounds that maintain aspect ratio if requested
    const finalBounds =
      this.options.maintainAspectRatio !== false
        ? this.calculateAspectRatioBounds(containerBounds)
        : containerBounds;

    this.currentBounds = finalBounds;

    // Update image element position/size
    if (this.imgElement && this.isImageLoaded) {
      // Get current viewport transform
      const scale = this.renderer.getScale();
      const viewportPos = this.renderer.getViewportPosition();
      this.updateImageTransform(viewportPos.x, viewportPos.y, scale);
    }

    // Mark as dirty instead of triggering re-render
    this.markDirty();

    // Notify bounds change callbacks
    this.notifyBoundsChanged();
  }

  get containerId() {
    return this.id;
  }

  protected async renderImpl(
    renderer: Renderer2D,
    _renderMeta: RenderMeta
  ): Promise<void> {
    // The image is rendered via the HTML <img> element, not through Pixi.
    if (
      this.imgElement &&
      this.isImageLoaded &&
      renderer.isReady() &&
      (!this.currentBounds || !isRectNonEmpty(this.currentBounds))
    ) {
      const dims = renderer.getContainerDimensions();
      this.handleResize(dims.width, dims.height);
    }

    if (this.isImageLoaded) {
      this.emitLoaded();
    }

    this.notifyBoundsChanged();
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
   * Shows the image element.
   */
  show(): void {
    if (this.imgElement) {
      this.imgElement.style.display = "";
    }
  }

  /**
   * Hides the image element.
   */
  hide(): void {
    if (this.imgElement) {
      this.imgElement.style.display = "none";
    }
  }

  /**
   * Cleanup method to remove resize observer when overlay is destroyed.
   */
  destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    }

    if (this.viewportUnsubscribe) {
      this.viewportUnsubscribe();
      this.viewportUnsubscribe = undefined;
    }

    if (this.imgElement) {
      this.imgElement.remove();
      this.imgElement = undefined;
    }

    this.boundsChangeCallbacks = [];
  }
}
