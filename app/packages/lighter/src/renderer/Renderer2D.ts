/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { EventBus } from "../event/EventBus";
import type {
  DrawStyle,
  Point,
  Rect,
  TextOptions,
  Dimensions2D,
} from "../types";

/**
 * Types of image sources that can be rendered.
 */
export type ImageSourceType =
  | "html-image"
  | "canvas"
  | "texture"
  | "image-data"
  | "bitmap"
  | "custom";

/**
 * Generic image source that can be any image-like object.
 * This is intentionally generic to avoid coupling to specific libraries.
 */
export interface ImageSource {
  type: ImageSourceType;
  src?: string; // For HTMLImageElement compatibility
  texture?: any; // For TextureLike objects
  canvas?: HTMLCanvasElement; // For canvas elements
  imageData?: ImageData; // For ImageData objects
  bitmap?: ImageBitmap; // For ImageBitmap objects
  custom?: any; // For custom image implementations
}

/**
 * Options for drawing images.
 */
export interface ImageOptions {
  opacity?: number;
  rotation?: number; // in radians
  scaleX?: number;
  scaleY?: number;
}

/**
 * Generic options for resource operations.
 */
export interface ResourceOptions {
  opacity?: number;
  rotation?: number; // in radians
  scaleX?: number;
  scaleY?: number;
}

/**
 * 2D renderer interface (merges backend and strategy responsibilities).
 */
export interface Renderer2D {
  // Infrastructure
  eventBus?: EventBus;

  // Render loop
  startRenderLoop(onFrame: () => void): void;
  stopRenderLoop(): void;

  // Drawing methods
  drawRect(bounds: Rect, style: DrawStyle, containerId: string): void;
  drawText(
    text: string,
    position: Point,
    options: TextOptions | undefined,
    containerId: string
  ): Dimensions2D;
  drawLine(
    start: Point,
    end: Point,
    style: DrawStyle,
    containerId: string
  ): void;
  drawImage(
    image: ImageSource,
    destination: Rect,
    options: ImageOptions | undefined,
    containerId: string
  ): void;
  clear(): void;

  dispose(containerId: string): void;
  hide(containerId: string): void;
  show(containerId: string): void;

  /**
   * Update resource bounds directly without recreating the sprite to avoid flicker during resize
   * @param containerId - The container ID.
   * @param bounds - The new bounds for the resource.
   */
  updateResourceBounds(containerId: string, bounds: Rect): void;

  // Hit testing
  /**
   * Tests if a point intersects with a rendered container.
   * @param point - The point to test in canvas coordinates.
   * @param containerId - Optional container ID to test a specific group. If not provided, tests all containers.
   * @returns True if the point intersects with the container.
   */
  hitTest(point: Point, containerId?: string): boolean;

  /**
   * Gets the bounds of a rendered container.
   * @param containerId - The container ID.
   * @returns The bounds of the container, or undefined if not found.
   */
  getBounds(containerId: string): Rect | undefined;

  // Container information
  getContainerDimensions(): { width: number; height: number };

  /**
   * Returns the underlying HTMLCanvasElement used for rendering.
   */
  getCanvas(): HTMLCanvasElement;

  /**
   * Cleans up the renderer.
   * Releases any resources held by the renderer.
   */
  cleanUp(): void;
}
