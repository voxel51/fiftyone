/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { EventBus } from "../event/EventBus";
import type { DrawStyle, Point, Rect, TextOptions } from "../types";

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
 * 2D renderer interface (merges backend and strategy responsibilities).
 */
export interface Renderer2D {
  // Infrastructure
  eventBus?: EventBus;

  // Render loop
  startRenderLoop(onFrame: () => void): void;
  stopRenderLoop(): void;

  // Drawing methods
  drawRect(bounds: Rect, style: DrawStyle, id?: string): void;
  drawText(
    text: string,
    position: Point,
    options?: TextOptions,
    id?: string
  ): void;
  drawLine(start: Point, end: Point, style: DrawStyle, id?: string): void;
  drawImage(
    image: ImageSource,
    destination: Rect,
    options?: ImageOptions,
    id?: string
  ): void;
  clear(): void;

  // Element management
  dispose(id: string): void;

  // Hit testing
  /**
   * Tests if a point intersects with a rendered element.
   * @param point - The point to test in canvas coordinates.
   * @param id - Optional ID to test a specific element. If not provided, tests all elements.
   * @returns True if the point intersects with the element(s).
   */
  hitTest(point: Point, id?: string): boolean;

  /**
   * Gets the bounds of a rendered element.
   * @param id - The element ID.
   * @returns The bounds of the element, or undefined if not found.
   */
  getBounds(id: string): Rect | undefined;

  // Container information
  getContainerDimensions(): { width: number; height: number };
}
