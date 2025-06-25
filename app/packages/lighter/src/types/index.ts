/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

/**
 * Render status of an overlay.
 */
export type RenderStatus = "pending" | "decoded" | "painting" | "painted";

/**
 * Matrix for transformations.
 */
export interface Matrix {
  a: number; // scale x
  b: number; // skew y
  c: number; // skew x
  d: number; // scale y
  e: number; // translate x
  f: number; // translate y
}

/**
 * 2D Point.
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * 3D Point.
 */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Bounding box.
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Render context for overlays.
 */
export interface RenderContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  scale: number;
  viewport: BoundingBox;
}

/**
 * Base overlay interface.
 */
export interface Overlay {
  readonly id: string;
  readonly name: string;
  readonly tags: string[];
  renderStatus: RenderStatus;
  zIndex: number;
  transform: Matrix;

  render(ctx: RenderContext): void;
  applyTransform(matrix: Matrix): void;
  hitTest(point: Point2D): boolean;
  getBounds(): BoundingBox;
  dispose(): void;
}

/**
 * Overlay type for factory registration.
 */
export type OverlayType = "bounding-box" | "classification" | string;

/**
 * Overlay creation options.
 */
export interface OverlayOptions {
  id: string;
  name: string;
  tags?: string[];
  zIndex?: number;
  [key: string]: any;
}

/**
 * Resource to be loaded.
 */
export interface Resource {
  url: string;
  type: "image" | "json" | "binary";
  retryCount?: number;
}

/**
 * Loaded resource result.
 */
export interface LoadedResource {
  data: any;
  url: string;
  type: string;
}

/**
 * Command for undo/redo operations.
 */
export interface Command {
  execute(): void;
  undo(): void;
  description: string;
}

/**
 * Scene dimension type.
 */
export type SceneDimension = "2d" | "3d";

/**
 * Event data types.
 */
export interface OverlayEventData {
  overlayId: string;
  overlay?: Overlay;
}

export interface OverlayErrorEventData extends OverlayEventData {
  error: Error;
  retryAttempt: number;
}

export interface OverlayUpdatedEventData extends OverlayEventData {
  changes: Record<string, any>;
  previousState?: Record<string, any>;
}
