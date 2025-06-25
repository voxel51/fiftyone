/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { BaseOverlay } from "./BaseOverlay";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { Rect, DrawStyle } from "../types";

/**
 * Options for creating a bounding box overlay.
 */
export interface BoundingBoxOptions {
  bounds: Rect;
  label?: string;
  confidence?: number;
}

/**
 * Bounding box overlay implementation.
 */
export class BoundingBoxOverlay extends BaseOverlay {
  constructor(private options: BoundingBoxOptions) {
    const id = `bbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    super(id, "bounding-box", ["detection", "bounding-box"]);
  }

  render(renderer: Renderer2D, style: DrawStyle): void {
    // Draw the bounding box
    renderer.drawRect(this.options.bounds, style);

    // Draw label if provided
    if (this.options.label) {
      const labelPosition = {
        x: this.options.bounds.x,
        y: this.options.bounds.y - 20, // Above the box
      };

      renderer.drawText(this.options.label, labelPosition, {
        fontColor: style.strokeStyle || "#000",
        fontSize: 12,
        backgroundColor: "rgba(255, 255, 255, 0.8)",
        padding: 2,
      });
    }

    // Emit overlay-loaded event using the common method
    this.emitLoaded();
  }

  /**
   * Gets the bounding box bounds.
   * @returns The bounds of the bounding box.
   */
  getBounds(): Rect {
    return this.options.bounds;
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
}
