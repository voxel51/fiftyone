/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

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
  // Render loop
  startRenderLoop(onFrame: () => void): void;
  stopRenderLoop(): void;

  // Drawing methods
  drawRect(bounds: Rect, style: DrawStyle): void;
  drawText(text: string, position: Point, options?: TextOptions): void;
  drawLine(start: Point, end: Point, style: DrawStyle): void;
  drawCircle(center: Point, radius: number, style: DrawStyle): void;
  drawImage(
    image: ImageSource,
    destination: Rect,
    options?: ImageOptions
  ): void;
  clear(): void;

  // Container information
  getContainerDimensions(): { width: number; height: number };
}
