/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { BaseOverlay, OverlayStatus } from "./BaseOverlay";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { EventBus } from "../event/EventBus";
import type { Rect, DrawStyle } from "../types";

/**
 * Options for creating a bounding box overlay.
 */
export interface BoundingBoxOptions {
  bounds: Rect;
  style: DrawStyle;
  label?: string;
  confidence?: number;
}

/**
 * Bounding box overlay implementation.
 */
export class BoundingBoxOverlay implements BaseOverlay {
  readonly id: string;
  name = "bounding-box";
  tags: string[] = [];
  status: OverlayStatus = "pending";
  private renderer?: Renderer2D;
  private eventBus?: EventBus;

  constructor(private options: BoundingBoxOptions) {
    this.id = this.generateId();
    this.tags = ["detection", "bounding-box"];
  }

  setRenderer(renderer: Renderer2D): void {
    this.renderer = renderer;
  }

  attachEventBus(bus: EventBus): void {
    this.eventBus = bus;
    // Listen for undo/redo events
    bus.on("undo", () => {
      // Handle undo if needed
    });
    bus.on("redo", () => {
      // Handle redo if needed
    });
  }

  render(renderer: Renderer2D): void {
    this.status = "painting";

    // Draw the bounding box
    renderer.drawRect(this.options.bounds, this.options.style);

    // Draw label if provided
    if (this.options.label) {
      const labelPosition = {
        x: this.options.bounds.x,
        y: this.options.bounds.y - 20, // Above the box
      };

      renderer.drawText(this.options.label, labelPosition, {
        fontColor: this.options.style.strokeStyle || "#000",
        fontSize: 12,
        backgroundColor: "rgba(255, 255, 255, 0.8)",
        padding: 2,
      });
    }

    this.status = "painted";

    // Emit overlay-loaded event
    if (this.eventBus) {
      this.eventBus.emit({
        type: "overlay-loaded",
        detail: { id: this.id },
      });
    }
  }

  /**
   * Gets the bounding box bounds.
   * @returns The bounds of the bounding box.
   */
  getBounds(): Rect {
    return this.options.bounds;
  }

  /**
   * Gets the drawing style.
   * @returns The drawing style.
   */
  getStyle(): DrawStyle {
    return this.options.style;
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

  private generateId(): string {
    return `bbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
