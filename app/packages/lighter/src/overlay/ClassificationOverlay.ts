/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { BaseOverlay, OverlayStatus } from "./BaseOverlay";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { EventBus } from "../event/EventBus";
import type { Point, DrawStyle } from "../types";

/**
 * Options for creating a classification overlay.
 */
export interface ClassificationOptions {
  label: string;
  confidence: number;
  position: Point;
  style?: DrawStyle;
  showConfidence?: boolean;
}

/**
 * Classification overlay implementation.
 */
export class ClassificationOverlay implements BaseOverlay {
  readonly id: string;
  name = "classification";
  tags: string[] = [];
  status: OverlayStatus = "pending";
  private renderer?: Renderer2D;
  private eventBus?: EventBus;

  constructor(private options: ClassificationOptions) {
    this.id = this.generateId();
    this.tags = ["classification", "label"];
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

    const text = this.options.showConfidence
      ? `${this.options.label} (${(this.options.confidence * 100).toFixed(1)}%)`
      : this.options.label;

    // Draw the classification text
    renderer.drawText(text, this.options.position, {
      fontColor: this.options.style?.strokeStyle || "#000",
      fontSize: 14,
      backgroundColor: "rgba(255, 255, 255, 0.9)",
      padding: 4,
      maxWidth: 200,
    });

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
   * Gets the classification label.
   * @returns The label text.
   */
  getLabel(): string {
    return this.options.label;
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
   * Gets the drawing style.
   * @returns The drawing style.
   */
  getStyle(): DrawStyle | undefined {
    return this.options.style;
  }

  /**
   * Checks if confidence should be shown.
   * @returns True if confidence should be displayed.
   */
  shouldShowConfidence(): boolean {
    return this.options.showConfidence ?? false;
  }

  private generateId(): string {
    return `cls_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
