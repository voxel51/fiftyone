/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { LIGHTER_EVENTS } from "../event/EventBus";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { Selectable } from "../selection/Selectable";
import type { DrawStyle, Hoverable, Point, RawLookerLabel } from "../types";
import { BaseOverlay } from "./BaseOverlay";

export type ClassificationLabel = RawLookerLabel & {
  label: string;
};

/**
 * Options for creating a classification overlay.
 */
export interface ClassificationOptions {
  sampleId: string;
  label: ClassificationLabel;
  confidence: number;
  position: Point;
  showConfidence?: boolean;
  selectable?: boolean;
  field?: string;
}

/**
 * Classification overlay implementation with selection support.
 */
export class ClassificationOverlay
  extends BaseOverlay
  implements Selectable, Hoverable
{
  private isSelectedState = false;

  constructor(private options: ClassificationOptions) {
    const id =
      options.label["_id"] ??
      options.label.id ??
      `cls_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    super(id, options.sampleId, options.label, options.field);
  }

  get containerId() {
    return this.id;
  }

  render(renderer: Renderer2D, style: DrawStyle): void {
    // Dispose of old elements before creating new ones
    renderer.dispose(this.containerId);

    const text = this.options.showConfidence
      ? `${this.options.label.label} (${(this.options.confidence * 100).toFixed(
          1
        )}%)`
      : this.options.label.label;

    // Create style with selection state
    const renderStyle: DrawStyle = {
      ...style,
      isSelected: this.isSelectedState,
    };

    // Draw the classification text
    renderer.drawText(
      text,
      this.options.position,
      {
        fontColor: style.strokeStyle || "#000",
        fontSize: 14,
        backgroundColor: "rgba(255, 255, 255, 0.9)",
        padding: 4,
        maxWidth: 200,
      },
      this.containerId
    );

    // Draw selection border if selected
    if (this.isSelectedState) {
      const bounds = this.getBounds();
      const selectionStyle: DrawStyle = {
        strokeStyle: style.selectionColor || "#ff6600",
        lineWidth: 2,
        dashPattern: [5, 5],
        isSelected: true,
      };
      const borderBounds = {
        x: bounds.x - 2,
        y: bounds.y - 2,
        width: bounds.width + 4,
        height: bounds.height + 4,
      };
      renderer.drawRect(borderBounds, selectionStyle, this.containerId);
    }

    this.emitLoaded();
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
    // Classifications have high priority (smaller, more specific targets)
    return 15;
  }

  /**
   * Gets the classification label.
   * @returns The label text.
   */
  getLabel(): string {
    return this.options.label.label;
  }

  /**
   * Gets the confidence score.
   * @returns The confidence score.
   */
  getConfidence(): number {
    return this.options.confidence;
  }

  /**
   * Gets the position.
   * @returns The position where the classification is displayed.
   */
  getPosition(): Point {
    return this.options.position;
  }

  /**
   * Sets the position.
   * @param position - The new position for the classification.
   */
  setPosition(position: Point): void {
    this.options.position = position;
    this.markDirty();
  }

  /**
   * Gets the bounds of the classification text.
   * @returns The bounding rectangle of the classification.
   */
  getBounds(): { x: number; y: number; width: number; height: number } {
    // For classifications, we'll estimate bounds based on text size
    const textLength = this.options.label.label.length;
    const estimatedWidth = Math.max(textLength * 8, 50); // Rough estimate
    const estimatedHeight = 20; // Standard text height

    return {
      x: this.options.position.x,
      y: this.options.position.y,
      width: estimatedWidth,
      height: estimatedHeight,
    };
  }

  /**
   * Sets the bounds of the classification.
   * For classifications, this only updates the position (x, y).
   * @param bounds - The new bounds.
   */
  setBounds(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): void {
    this.options.position = { x: bounds.x, y: bounds.y };
    this.markDirty();
  }

  /**
   * Checks if confidence should be shown.
   * @returns True if confidence should be displayed.
   */
  shouldShowConfidence(): boolean {
    return this.options.showConfidence ?? false;
  }

  getTooltipInfo(): {
    color: string;
    field: string;
    label: any;
    type: string;
    coordinates?: Point;
  } | null {
    return {
      color: "#4ecdc4", // This should come from the overlay's style
      field: this.field || "unknown",
      label: this.label,
      type: "Classification",
      coordinates: this.options.position,
    };
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

  onHoverMove(point: Point, event: PointerEvent): boolean {
    this.eventBus?.emit({
      type: LIGHTER_EVENTS.OVERLAY_HOVER_MOVE,
      detail: { id: this.id, point },
    });

    return true;
  }
}
