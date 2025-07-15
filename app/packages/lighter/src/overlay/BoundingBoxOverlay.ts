/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { BaseOverlay } from "./BaseOverlay";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { Rect, DrawStyle, Point } from "../types";
import { LIGHTER_EVENTS } from "../event/EventBus";
import type { Movable } from "../undo/MoveOverlayCommand";
import type { Selectable } from "../selection/Selectable";

/**
 * Options for creating a bounding box overlay.
 */
export interface BoundingBoxOptions {
  bounds: Rect;
  label?: string;
  confidence?: number;
  draggable?: boolean;
  selectable?: boolean;
}

/**
 * Bounding box overlay implementation with drag support and selection.
 */
export class BoundingBoxOverlay
  extends BaseOverlay
  implements Movable, Selectable
{
  private isDraggable: boolean;
  private dragStartPoint?: Point;
  private dragStartBounds?: Rect;
  private isSelectedState = false;

  constructor(private options: BoundingBoxOptions) {
    const id = `bbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    super(id, "bounding-box", ["detection", "bounding-box"]);
    this.isDraggable = options.draggable !== false; // Default to true
  }

  render(renderer: Renderer2D, style: DrawStyle): void {
    // Dispose of old elements before creating new ones
    renderer.dispose(this.id);
    if (this.options.label) {
      renderer.dispose(`${this.id}-label`);
    }

    // Create style with selection state
    const renderStyle: DrawStyle = {
      ...style,
      isSelected: this.isSelectedState,
    };

    // Draw the bounding box
    renderer.drawRect(this.options.bounds, renderStyle, this.id);

    // Draw label if provided
    if (this.options.label) {
      const labelPosition = {
        x: this.options.bounds.x,
        y: this.options.bounds.y - 20, // Above the box
      };

      renderer.drawText(
        this.options.label,
        labelPosition,
        {
          fontColor: style.strokeStyle || "#000",
          fontSize: 12,
          backgroundColor: "rgba(255, 255, 255, 0.8)",
          padding: 2,
        },
        `${this.id}-label`
      );
    }

    // Emit overlay-loaded event using the common method
    this.emitLoaded();
  }

  // Movable interface implementation
  getPosition(): Point {
    return {
      x: this.options.bounds.x,
      y: this.options.bounds.y,
    };
  }

  setPosition(position: Point): void {
    this.options.bounds.x = position.x;
    this.options.bounds.y = position.y;
  }

  // Interaction handlers
  onPointerDown(point: Point, event: PointerEvent): boolean {
    if (!this.isDraggable) return false;

    // Store drag start information
    this.dragStartPoint = point;
    this.dragStartBounds = { ...this.options.bounds };

    return true; // Indicate we can handle this event
  }

  onPointerMove(point: Point, event: PointerEvent): boolean {
    if (!this.dragStartPoint || !this.dragStartBounds) return false;

    const delta = {
      x: point.x - this.dragStartPoint.x,
      y: point.y - this.dragStartPoint.y,
    };

    // Update bounds
    this.options.bounds = {
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
   * Gets the bounding box bounds.
   * @returns The bounds of the bounding box.
   */
  getBounds(): Rect {
    return this.options.bounds;
  }

  /**
   * Sets the bounding box bounds.
   * @param bounds - The new bounds.
   */
  setBounds(bounds: Rect): void {
    this.options.bounds = bounds;
    this.markDirty();
  }

  /**
   * Gets the label text.
   * @returns The label text, if any.
   */
  getLabel(): string | undefined {
    return this.options.label;
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
