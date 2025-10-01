/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Movable } from "../commands/MoveOverlayCommand";
import {
  DEFAULT_TEXT_PADDING,
  LABEL_ARCHETYPE_PRIORITY,
  STROKE_WIDTH,
} from "../constants";
import { CONTAINS } from "../core/Scene2D";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { Selectable } from "../selection/Selectable";
import type {
  BoundedOverlay,
  Hoverable,
  Point,
  RawLookerLabel,
  Rect,
  Spatial,
} from "../types";
import {
  getInstanceStrokeStyles,
  getSimpleStrokeStyles,
} from "../utils/colorMapping";
import { distanceFromLineSegment } from "../utils/geometry";
import { BaseOverlay } from "./BaseOverlay";

export type BoundingBoxLabel = RawLookerLabel & {
  label: string;
  bounding_box: number[];
  confidence?: number;
};

/**
 * Options for creating a bounding box overlay.
 */
export interface BoundingBoxOptions {
  sampleId: string;
  // Relative bounds [0,1]
  relativeBounds?: Rect;
  label: BoundingBoxLabel;
  confidence?: number;
  draggable?: boolean;
  selectable?: boolean;
  field?: string;
}

/**
 * Bounding box overlay implementation with drag support, selection, and spatial coordinates.
 */
export class BoundingBoxOverlay
  extends BaseOverlay
  implements Movable, Selectable, BoundedOverlay, Spatial, Hoverable
{
  private isDraggable: boolean;
  private dragStartPoint?: Point;
  private dragStartBounds?: Rect;
  private isSelectedState = false;
  private relativeBounds: Rect;
  private absoluteBounds: Rect;

  private _needsCoordinateUpdate = false;
  private textBounds?: Rect;

  constructor(private options: BoundingBoxOptions) {
    const id =
      options.label["_id"] ??
      options.label.id ??
      `bbox_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    super(id, options.sampleId, options.label, options.field);
    this.isDraggable = options.draggable !== false;

    // Initialize bounds
    if (options.relativeBounds) {
      this.relativeBounds = { ...options.relativeBounds };
      this.absoluteBounds = { x: 0, y: 0, width: 0, height: 0 }; // Will be set by scene
      this._needsCoordinateUpdate = true;
    } else {
      throw new Error("Either bounds or relativeBounds must be provided");
    }
  }

  getOverlayType(): string {
    return "BoundingBoxOverlay";
  }

  // Spatial interface implementation
  getRelativeBounds(): Rect {
    return { ...this.relativeBounds };
  }

  setAbsoluteBounds(bounds: Rect): void {
    this.absoluteBounds = { ...bounds };
    this._needsCoordinateUpdate = false;
    this.markDirty();
  }

  setRelativeBounds(bounds: Rect): void {
    this.relativeBounds = { ...bounds };
    this._needsCoordinateUpdate = true;
    this.markDirty();
  }

  getAbsoluteBounds(): Rect {
    return { ...this.absoluteBounds };
  }

  needsCoordinateUpdate(): boolean {
    return this._needsCoordinateUpdate;
  }

  markForCoordinateUpdate(): void {
    this._needsCoordinateUpdate = true;
    this.markDirty();
  }

  markCoordinateUpdateComplete(): void {
    this._needsCoordinateUpdate = false;
  }

  get containerId() {
    return this.id;
  }

  protected renderImpl(renderer: Renderer2D): void {
    // Dispose of old elements before creating new ones
    renderer.dispose(this.containerId);

    const style = this.currentStyle;

    if (!style) return;

    // Check if this label has an instance to determine stroke styling
    const hasInstance = this.options.label.instance?._id !== undefined;

    // Get stroke styles based on whether the label has an instance
    const { strokeColor, overlayStrokeColor, overlayDash, hoverStrokeColor } =
      hasInstance
        ? getInstanceStrokeStyles({
            isSelected: this.isSelectedState,
            strokeColor: style.strokeStyle || "#000000",
            isHovered: this.isHoveredState,
            dashLength: 8,
          })
        : getSimpleStrokeStyles({
            isSelected: this.isSelectedState,
            strokeColor: style.strokeStyle || "#ffffff",
            isHovered: this.isHoveredState,
            dashLength: 8,
          });

    const mainStrokeStyle = {
      ...style,
      strokeStyle: strokeColor,
      isSelected: this.isSelectedState,
    };

    if (!style.dashPattern && overlayStrokeColor && overlayDash) {
    } else if (style.dashPattern) {
      mainStrokeStyle.dashPattern = style.dashPattern;
    }

    renderer.drawRect(this.absoluteBounds, mainStrokeStyle, this.containerId);

    if (hoverStrokeColor) {
      renderer.drawRect(
        this.absoluteBounds,
        {
          strokeStyle: hoverStrokeColor,
          lineWidth: style.lineWidth || 2,
        },
        this.containerId
      );
    } else if (overlayStrokeColor && overlayDash) {
      renderer.drawRect(
        this.absoluteBounds,
        {
          strokeStyle: overlayStrokeColor,
          lineWidth: style.lineWidth,
          dashPattern: [overlayDash, overlayDash],
        },
        this.containerId
      );
    }

    if (this.options.label && this.options.label.label?.length > 0) {
      const labelPosition = {
        x: this.absoluteBounds.x + DEFAULT_TEXT_PADDING - 1,
        y: this.absoluteBounds.y - 20,
      };

      let textToDraw = this.options.label.label;

      if (
        typeof this.options.label.confidence !== "undefined" &&
        !isNaN(this.options.label.confidence)
      ) {
        textToDraw += ` (${this.options.label.confidence.toFixed(2)})`;
      }

      // Draw text and store the dimensions for accurate header detection
      const textDimensions = renderer.drawText(
        textToDraw,
        labelPosition,
        {
          fontColor: "#ffffff",
          backgroundColor: style.fillStyle || style.strokeStyle || "#000",
        },
        this.containerId
      );

      this.textBounds = {
        x: labelPosition.x,
        y: labelPosition.y,
        width: textDimensions.width,
        height: textDimensions.height,
      };
    }

    this.emitLoaded();
  }

  // Movable interface implementation
  getPosition(): Point {
    return {
      x: this.absoluteBounds.x,
      y: this.absoluteBounds.y,
    };
  }

  setPosition(position: Point): void {
    this.absoluteBounds = {
      ...this.absoluteBounds,
      x: position.x,
      y: position.y,
    };

    this.markForCoordinateUpdate();
  }

  // Interaction handlers
  onPointerDown(point: Point, event: PointerEvent): boolean {
    if (!this.isDraggable) return false;

    // Store drag start information
    this.dragStartPoint = point;
    this.dragStartBounds = { ...this.absoluteBounds };

    return true;
  }

  onDrag(point: Point, event: PointerEvent): boolean {
    if (!this.dragStartPoint || !this.dragStartBounds) return false;

    const delta = {
      x: point.x - this.dragStartPoint.x,
      y: point.y - this.dragStartPoint.y,
    };

    // Update absolute bounds
    this.absoluteBounds = {
      x: this.dragStartBounds.x + delta.x,
      y: this.dragStartBounds.y + delta.y,
      width: this.dragStartBounds.width,
      height: this.dragStartBounds.height,
    };

    this.markDirty();

    return true;
  }

  onPointerUp(point: Point, event: PointerEvent): boolean {
    if (!this.dragStartPoint || !this.dragStartBounds) return false;

    // Mark final position for relative-coordinate update and reset drag state
    this.markForCoordinateUpdate();
    this.dragStartPoint = undefined;
    this.dragStartBounds = undefined;

    return true;
  }

  /**
   * Gets the bounding box bounds (absolute).
   * @returns The bounds of the bounding box.
   */
  getBounds(): Rect {
    return this.getAbsoluteBounds();
  }

  /**
   * Gets the current bounds of the bounding box (implements BoundedOverlay).
   * @returns The current bounds of the bounding box.
   */
  getCurrentBounds(): Rect | undefined {
    return this.getAbsoluteBounds();
  }

  /**
   * Forces the overlay to recalculate and update its current bounds (implements BoundedOverlay).
   * For bounding boxes, this marks it for coordinate update.
   */
  forceUpdateBounds(): void {
    this.markForCoordinateUpdate();
  }

  /**
   * Sets the bounding box bounds (absolute).
   * @param bounds - The new bounds.
   */
  setBounds(bounds: Rect): void {
    this.absoluteBounds = { ...bounds };
    this.markForCoordinateUpdate();
  }

  /**
   * Gets the label text.
   * @returns The label text, if any.
   */
  getLabel(): string | undefined {
    return this.options.label.label;
  }

  /**
   * Gets the confidence score.
   * @returns The confidence score, if any.
   */
  getConfidence(): number | undefined {
    return this.options.label?.confidence;
  }

  /**
   * Sets whether this overlay can be dragged.
   * @param draggable - Whether the overlay should be draggable.
   */
  setDraggable(draggable: boolean): void {
    this.isDraggable = draggable;
  }

  /**
   * Gets whether this overlay is draggable.
   * @returns True if the overlay is draggable.
   */
  getDraggable(): boolean {
    return this.isDraggable;
  }

  /**
   * Gets the containment level for ordering purposes.
   * @param point - The point to test.
   * @returns The containment level (NONE = 0, CONTENT = 1, BORDER = 2).
   */
  getContainmentLevel(point: Point): CONTAINS {
    const drawnBounds = this.getDrawnBBox();

    // Check if point is inside the main bounding box
    if (this.isPointInRect(point, drawnBounds)) {
      return CONTAINS.CONTENT;
    }

    // Check if point is in the label text area (header)
    if (this.textBounds && this.isPointInRect(point, this.textBounds)) {
      return CONTAINS.BORDER;
    }

    return CONTAINS.NONE;
  }

  /**
   * Gets the distance from this overlay to a mouse point.
   * @param point - The mouse point.
   * @returns The distance to the point.
   */
  getMouseDistance(point: Point): number {
    // If point is in header, return 0 (highest priority)
    if (this.textBounds && this.isPointInRect(point, this.textBounds)) {
      return 0;
    }

    // Get the drawn bounding box
    const drawnBounds = this.getDrawnBBox();

    // Calculate distance to each edge of the bounding box
    const distances = [
      distanceFromLineSegment(
        point,
        { x: drawnBounds.x, y: drawnBounds.y },
        { x: drawnBounds.x + drawnBounds.width, y: drawnBounds.y }
      ),
      distanceFromLineSegment(
        point,
        { x: drawnBounds.x + drawnBounds.width, y: drawnBounds.y },
        {
          x: drawnBounds.x + drawnBounds.width,
          y: drawnBounds.y + drawnBounds.height,
        }
      ),
      distanceFromLineSegment(
        point,
        {
          x: drawnBounds.x + drawnBounds.width,
          y: drawnBounds.y + drawnBounds.height,
        },
        { x: drawnBounds.x, y: drawnBounds.y + drawnBounds.height }
      ),
      distanceFromLineSegment(
        point,
        { x: drawnBounds.x, y: drawnBounds.y + drawnBounds.height },
        { x: drawnBounds.x, y: drawnBounds.y }
      ),
    ];

    return Math.min(...distances);
  }

  /**
   * Gets the drawn bounding box, accounting for stroke width.
   * Similar to looker's getDrawnBBox method.
   * @returns The drawn bounding box with stroke width expansion.
   */
  private getDrawnBBox(): Rect {
    const bounds = this.absoluteBounds;
    const strokeWidth = this.getCurrentStyle()?.lineWidth ?? STROKE_WIDTH;

    return {
      x: bounds.x - strokeWidth,
      y: bounds.y - strokeWidth,
      width: bounds.width + strokeWidth * 2,
      height: bounds.height + strokeWidth * 2,
    };
  }

  /**
   * Checks if a point is inside a rectangle.
   * @param point - The point to test.
   * @param rect - The rectangle to test against.
   * @returns True if the point is inside the rectangle.
   */
  private isPointInRect(point: Point, rect: Rect): boolean {
    return (
      point.x >= rect.x &&
      point.y >= rect.y &&
      point.x <= rect.x + rect.width &&
      point.y <= rect.y + rect.height
    );
  }

  // Selectable interface implementation
  isSelected(): boolean {
    return this.isSelectedState;
  }

  setSelected(selected: boolean): void {
    if (this.isSelectedState !== selected) {
      this.isSelectedState = selected;
      this.markDirty();
    }
  }

  toggleSelected(): boolean {
    this.setSelected(!this.isSelectedState);
    return this.isSelectedState;
  }

  getSelectionPriority(): number {
    return LABEL_ARCHETYPE_PRIORITY.BOUNDING_BOX;
  }

  // Hoverable interface implementation
  onHoverEnter(point: Point, event: PointerEvent): boolean {
    this.isHoveredState = true;
    this.markDirty();
    return true;
  }

  onHoverLeave(point: Point, event: PointerEvent): boolean {
    this.isHoveredState = false;
    this.markDirty();
    return true;
  }

  getTooltipInfo(): {
    color: string;
    field: string;
    label: any;
    type: string;
  } | null {
    return {
      color: "#ff6b6b", // This should come from the overlay's style (owned by Scene2D)
      field: this.field || "unknown",
      label: this.label,
      type: "Detection",
    };
  }
}
