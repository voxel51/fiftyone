/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { DEFAULT_TEXT_PADDING } from "../constants";
import { LIGHTER_EVENTS } from "../event/EventBus";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { Selectable } from "../selection/Selectable";
import type {
  BoundedOverlay,
  DrawStyle,
  Hoverable,
  Point,
  RawLookerLabel,
  Rect,
  Spatial,
} from "../types";
import type { Movable } from "../undo/MoveOverlayCommand";
import {
  getInstanceStrokeStyles,
  getSimpleStrokeStyles,
} from "../utils/colorMapping";
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
  private isHoveredState = false;

  private _needsCoordinateUpdate = false;

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
    this._needsCoordinateUpdate = false;
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

  render(renderer: Renderer2D, style: DrawStyle): void {
    // Dispose of old elements before creating new ones
    renderer.dispose(this.containerId);

    // Check if this label has an instance to determine stroke styling
    const hasInstance = this.options.label.instance?._id !== undefined;

    // Get stroke styles based on whether the label has an instance
    const { strokeColor, overlayStrokeColor, overlayDash } = hasInstance
      ? getInstanceStrokeStyles({
          isSelected: this.isSelectedState,
          strokeColor: style.strokeStyle || "#000000",
          isHovered: this.isHoveredState,
          dashLength: 8,
        })
      : getSimpleStrokeStyles({
          isSelected: this.isSelectedState,
          strokeColor: style.strokeStyle || "#ffffff",
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

    if (overlayStrokeColor && overlayDash) {
      renderer.drawRect(
        this.absoluteBounds,
        {
          strokeStyle: overlayStrokeColor,
          lineWidth: style.lineWidth || 2, // Make overlay stroke slightly thicker
          dashPattern: [overlayDash, overlayDash],
        },
        this.containerId
      );
    }

    if (this.options.label) {
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

      renderer.drawText(
        textToDraw,
        labelPosition,
        {
          fontColor: "#ffffff",
          backgroundColor: style.fillStyle || style.strokeStyle || "#000",
        },
        this.containerId
      );
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
    // Update absolute bounds with new position
    this.absoluteBounds.x = position.x;
    this.absoluteBounds.y = position.y;

    // Mark for coordinate update so the scene can properly convert
    // absolute coordinates back to relative coordinates using the coordinate system
    this.markForCoordinateUpdate();

    // Mark as dirty to trigger re-render
    this.markDirty();
  }

  // Interaction handlers
  onPointerDown(point: Point, event: PointerEvent): boolean {
    if (!this.isDraggable) return false;

    // Store drag start information
    this.dragStartPoint = point;
    this.dragStartBounds = { ...this.absoluteBounds };

    return true; // Indicate we can handle this event
  }

  onPointerMove(point: Point, event: PointerEvent): boolean {
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

    // Mark as dirty to trigger re-render
    this.markDirty();

    return true;
  }

  onPointerUp(point: Point, event: PointerEvent): boolean {
    if (!this.dragStartPoint || !this.dragStartBounds) return false;

    // Reset drag state
    this.dragStartPoint = undefined;
    this.dragStartBounds = undefined;

    return true;
  }

  onHoverEnter(point: Point, event: PointerEvent): boolean {
    this.isHoveredState = true;
    this.markDirty();

    // Emit event to trigger re-ordering
    this.eventBus?.emit({
      type: LIGHTER_EVENTS.OVERLAY_HOVER,
      detail: { id: this.id, point },
    });

    return true;
  }

  onHoverLeave(point: Point, event: PointerEvent): boolean {
    this.isHoveredState = false;
    this.markDirty();

    // Emit event to trigger re-ordering
    this.eventBus?.emit({
      type: LIGHTER_EVENTS.OVERLAY_UNHOVER,
      detail: { id: this.id, point },
    });

    return true;
  }

  onHoverMove(point: Point, event: PointerEvent): boolean {
    this.eventBus?.emit({
      type: LIGHTER_EVENTS.OVERLAY_HOVER_MOVE,
      detail: { id: this.id, point },
    });

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
    this.markDirty();
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
    return this.options.confidence;
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

  // Selectable interface implementation
  isSelected(): boolean {
    return this.isSelectedState;
  }

  setSelected(selected: boolean): void {
    if (this.isSelectedState !== selected) {
      this.isSelectedState = selected;
      this.markDirty(); // Trigger re-render to show/hide selection
    }
  }

  toggleSelected(): boolean {
    this.setSelected(!this.isSelectedState);
    return this.isSelectedState;
  }

  // Hoverable interface implementation
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
