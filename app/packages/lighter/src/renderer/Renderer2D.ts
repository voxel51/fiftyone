/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type {
  DrawStyle,
  Point,
  Rect,
  TextOptions,
  ViewportState,
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
  // in radians
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  /**
   * Per-object GPU tint (CSS color string or `0xRRGGBB`). Multiplies the
   * texture's RGB in the batched draw, so a white texture renders as `tint`
   * for free — no per-pixel CPU recolor. Undefined leaves the texture
   * untinted (white identity).
   */
  tint?: number | string;
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
 * 2D renderer interface.
 */
export interface Renderer2D {
  // Viewport state
  /**
   * Returns the current zoom and pan state of the viewport.
   */
  getViewportState(): ViewportState;

  /**
   * Applies a previously captured zoom and pan state to the viewport.
   */
  setViewportState(state: ViewportState): void;

  // Tick loop
  addTickHandler(onFrame: () => void): void;
  resetTickHandler(): void;

  // Drawing methods
  drawHandles(
    bounds: Rect,
    width: number,
    color: number | string,
    containerId: string
  ): void;
  drawScrim(
    bounds: Rect,
    canonicalMediaBounds: Rect,
    containerId: string
  ): void;
  drawRect(bounds: Rect, style: DrawStyle, containerId: string): void;
  drawText(
    text: string,
    position: Point,
    options: TextOptions | undefined,
    containerId: string
  ): Rect;
  drawPoint(
    center: Point,
    radius: number,
    style: DrawStyle,
    containerId: string
  ): void;
  drawPoints(
    centers: Point[],
    radius: number,
    style: DrawStyle,
    containerId: string
  ): void;
  drawLine(
    start: Point,
    end: Point,
    style: DrawStyle,
    containerId: string
  ): void;
  drawLines(
    segments: Array<[Point, Point]>,
    style: DrawStyle,
    containerId: string
  ): void;
  /**
   * Draw a closed polygon connecting `points` in order. When `style.fillStyle`
   * is set, the polygon interior is filled. When `style.strokeStyle` is set,
   * the boundary is stroked.
   */
  drawPolygon(points: Point[], style: DrawStyle, containerId: string): void;
  drawImage(
    image: ImageSource,
    destination: Rect,
    options: ImageOptions | undefined,
    containerId: string
  ): void;

  dispose(containerId: string): void;
  hide(containerId: string): void;
  show(containerId: string): void;

  /**
   * Update resource bounds
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
   * Reset the renderer's zoom level to 100% and clear any pan translation.
   */
  resetZoomPan(): void;

  /**
   * Increase the viewport zoom level (zoom in).
   */
  zoomIn(): void;

  /**
   * Decrease the viewport zoom level (zoom out).
   */
  zoomOut(): void;

  /**
   * Disables zoom and pan interactions (e.g., during overlay dragging).
   */
  disableZoomPan(): void;

  /**
   * Re-enables zoom and pan interactions after overlay interactions are complete.
   */
  enableZoomPan(): void;

  /**
   * Converts screen coordinates to world coordinates, accounting for viewport transformations.
   * @param screenPoint - The screen coordinates to convert.
   * @returns The world coordinates.
   */
  screenToWorld(screenPoint: Point): Point;

  /**
   * Returns current scaling factor of the viewport.
   * @returns Current scaling factor.
   */
  getScale(): number;

  /**
   * Returns the current viewport position (pan offset).
   * @returns The viewport position { x, y }.
   */
  getViewportPosition(): { x: number; y: number };

  /**
   * Adjusts the viewport zoom and pan so that the given world-space rectangle
   * is centered and fully visible, with optional padding.
   *
   * @param worldRect - The rectangle in world (canvas) coordinates to fit.
   * @param padding - Fraction of the viewport to reserve as padding on each
   *   side (0–1). Defaults to 0. A value of 0.1 leaves 10% padding.
   */
  fitToRect(worldRect: Rect, padding?: number): void;

  /**
   * Check if the renderer is initialized and ready to use.
   * @returns True if the renderer is ready.
   */
  isReady(): boolean;

  /**
   * Reset tick handler, and remove all children from the viewport.
   */
  cleanUp(): void;

  /**
   * Destroys the renderer.
   * Releases any resources held by the renderer.
   */
  destroy(): void;
}
