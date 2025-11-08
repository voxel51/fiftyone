/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { BaseLabel } from "@fiftyone/looker/src/overlays/base";
import { BaseOverlay } from "./overlay/BaseOverlay";

/**
 * 2D rectangle with position and size.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 2D point coordinates.
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Drawing style for shapes.
 */
export interface DrawStyle {
  strokeStyle?: string;
  fillStyle?: string;
  lineWidth?: number;
  opacity?: number;
  /** Border dash pattern for dashed/dotted lines. Empty array or undefined = solid line */
  dashPattern?: number[];
  /** Selection highlight style */
  isSelected?: boolean;
  /** Selection border color (defaults to orange if not specified) */
  selectionColor?: string;
}

/**
 * Text rendering options.
 */
export interface TextOptions {
  font?: string;
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  padding?: number;
  maxWidth?: number;
  height?: number;
}

/**
 * Status of an overlay in the rendering pipeline.
 */
export type OverlayStatus =
  | "pending"
  | "decoded"
  | "painting"
  | "painted"
  | "error";

/**
 * Options for creating an overlay.
 */
export type RawLookerLabel = Omit<BaseLabel, "_renderStatus"> | null;

/**
 * Interface for overlays that have current bounds.
 */
export interface BoundedOverlay extends BaseOverlay {
  getCurrentBounds(): Rect | undefined;
  forceUpdateBounds(): void;
}

/**
 * Interface for overlays that have spatial location/bounds.
 * These overlays store relative coordinates [0,1] and need coordinate transformation.
 */
export interface Spatial {
  /** Get relative coordinates [0-1rom data model */
  getRelativeBounds(): Rect;

  /** Set absolute coordinates in canvas space */
  setAbsoluteBounds(bounds: Rect): void;

  /** Get current absolute coordinates in canvas space */
  getAbsoluteBounds(): Rect;

  /** Set relative coordinates [0-1rom data model */
  setRelativeBounds(bounds: Rect): void;

  /** Check if overlay needs coordinate update */
  needsCoordinateUpdate(): boolean;

  /** Mark as needing coordinate update */
  markForCoordinateUpdate(): void;

  /** Mark coordinate update as complete */
  markCoordinateUpdateComplete(): void;

  /** get current position */
  getPosition(): Point;

  /** get position from start of drag/resize */
  getMoveStartPosition(): Point | undefined;

  /** return true if being dragged */
  isDragging(): boolean;

  /** return true if being resized */
  isResizing(): boolean;
}

/**
 * Transform matrix for coordinate conversions.
 */
export interface TransformMatrix {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Dimensions interface.
 */
export interface Dimensions {
  width: number;
  height: number;
}

/**
 * 2D dimensions type alias for width and height.
 */
export type Dimensions2D = { width: number; height: number };

/**
 * Coordinate system for transforming between relative and absolute coordinates.
 */
export interface CoordinateSystem {
  /** Convert relative coordinates to absolute */
  relativeToAbsolute(relative: Rect): Rect;

  /** Convert absolute coordinates to relative */
  absoluteToRelative(absolute: Rect): Rect;

  /** Get current transformation matrix */
  getTransform(): TransformMatrix;

  /** Update transformation from canonical media bounds */
  updateTransform(mediaBounds: Rect): void;
}

/**
 * Interface for canonical media (reference for coordinate system).
 */
export interface CanonicalMedia {
  /** Get original dimensions */
  getOriginalDimensions(): Dimensions;

  /** Get current rendered bounds in canvas */
  getRenderedBounds(): Rect;

  /** Get aspect ratio */
  getAspectRatio(): number;

  /** Listen for bounds changes */
  onBoundsChanged(callback: (bounds: Rect) => void): () => void;

  /** Force update bounds calculation */
  updateBounds(): void;
}

/**
 * Interface for overlays that can be hovered and show tooltips.
 */
export interface Hoverable {
  /** Get tooltip information for this overlay */
  getTooltipInfo(): {
    color: string;
    field: string;
    label: any;
    type: string;
  } | null;

  /** Handle hover enter event */
  onHoverEnter?(point: Point, event: PointerEvent): boolean;

  /** Handle hover leave event */
  onHoverLeave?(point: Point, event: PointerEvent): boolean;

  /** Handle hover move event */
  onHoverMove?(point: Point, event: PointerEvent): boolean;
}

/**
 * Persistence PDOs for adding bounding boxes.
 */
export class BoundingBoxPersistence {
  constructor(
    public readonly id: string,
    public readonly path: string,
    public readonly field: string,
    public readonly sampleId: string,
    public readonly label: string,
    public readonly bounds: Rect,
    public readonly misc: Record<string, any> = {}
  ) {}
}
