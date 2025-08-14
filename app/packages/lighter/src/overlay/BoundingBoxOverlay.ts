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
  Point,
  RawLookerLabel,
  Rect,
  Spatial,
} from "../types";
import type { Movable } from "../undo/MoveOverlayCommand";
import { BaseOverlay } from "./BaseOverlay";

export type BoundingBoxLabel = RawLookerLabel & {
  label: string;
  bounding_box: number[];
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
  implements Movable, Selectable, BoundedOverlay, Spatial
{
  private isDraggable: boolean;
  private dragStartPoint?: Point;
  private dragStartBounds?: Rect;
  private isSelectedState = false;
  private relativeBounds: Rect;
  private absoluteBounds: Rect;
  private _needsCoordinateUpdate = false;

  constructor(private options: BoundingBoxOptions) {
    const id = `bbox_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;
    super(id, options.sampleId, options.label, options.field);
    this.isDraggable = options.draggable !== false; // Default to true

    // Initialize bounds
    if (options.relativeBounds) {
      this.relativeBounds = { ...options.relativeBounds };
      this.absoluteBounds = { x: 0, y: 0, width: 0, height: 0 }; // Will be set by scene
      this._needsCoordinateUpdate = true;
    } else {
      throw new Error("Either bounds or relativeBounds must be provided");
    }
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

    // Create style with selection state
    const renderStyle: DrawStyle = {
      ...style,
      isSelected: this.isSelectedState,
    };

    // Draw the bounding box using absolute bounds
    renderer.drawRect(this.absoluteBounds, renderStyle, this.containerId);

    // Draw label if provided
    if (this.options.label) {
      const labelPosition = {
        x: this.absoluteBounds.x + DEFAULT_TEXT_PADDING - 1,
        y: this.absoluteBounds.y - 20,
      };
      renderer.drawText(
        this.options.label.label,
        labelPosition,
        {
          fontColor: "#ffffff",
          backgroundColor: style.fillStyle || style.strokeStyle || "#000",
        },
        this.containerId
      );
    }

    // Draw selection border if selected
    if (this.isSelectedState) {
      const selectionBounds = {
        x: this.absoluteBounds.x - 2,
        y: this.absoluteBounds.y - 2,
        width: this.absoluteBounds.width + 4,
        height: this.absoluteBounds.height + 4,
      };
      renderer.drawRect(
        selectionBounds,
        {
          strokeStyle: style.selectionColor || "#ff6600",
          lineWidth: 2,
          dashPattern: [5, 5],
          isSelected: true,
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
    // Emit hover event
    this.eventBus?.emit({
      type: LIGHTER_EVENTS.OVERLAY_HOVER,
      detail: { id: this.id, point },
    });

    return true;
  }

  onHoverLeave(point: Point, event: PointerEvent): boolean {
    // Emit unhover event
    this.eventBus?.emit({
      type: LIGHTER_EVENTS.OVERLAY_UNHOVER,
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

  getSelectionPriority(): number {
    // Bounding boxes have medium priority (higher than images, lower than points)
    return 10;
  }
}
