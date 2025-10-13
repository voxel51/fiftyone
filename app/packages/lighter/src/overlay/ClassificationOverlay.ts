/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import {
  FONT_SIZE,
  LABEL_ARCHETYPE_PRIORITY,
  SELECTED_DASH_LENGTH,
} from "../constants";
import type { Renderer2D } from "../renderer/Renderer2D";
import { BaseOverlay } from "./BaseOverlay";

/**
 * Options for creating a classification overlay.
 */
export interface ClassificationOptions {
  id: string;
  field: string;
}

/**
 * Classification overlay implementation with selection support.
 */
export class ClassificationOverlay extends BaseOverlay {
  constructor(options: ClassificationOptions) {
    super(options.id, options.field);
  }

  getOverlayType(): string {
    return "ClassificationOverlay";
  }

  get containerId() {
    return this.id;
  }

  protected renderImpl(renderer: Renderer2D): void {
    return;
    // Dispose of old elements before creating new ones
    renderer.dispose(this.containerId);

    const style = this.getCurrentStyle();
    if (!style) return;

    const text = this.options.showConfidence
      ? `${this.options.label.label} (${(this.options.confidence * 100).toFixed(
          1
        )}%)`
      : this.options.label.label;

    const { overlayStrokeColor, overlayDash } = getSimpleStrokeStyles({
      isSelected: this.isSelectedState,
      strokeColor: style.strokeStyle || "#000000",
      dashLength: this.isSelectedState ? SELECTED_DASH_LENGTH : undefined,
    });

    // Draw the classification text
    renderer.drawText(
      text,
      this.options.position,
      {
        fontColor: style.strokeStyle || "#000",
        fontSize: FONT_SIZE,
        backgroundColor: "rgba(255, 255, 255, 0.9)",
        padding: 4,
        maxWidth: 200,
      },
      this.containerId
    );

    // Draw selection border if selected
    if (overlayStrokeColor && overlayDash) {
      const bounds = this.getBounds();
      const borderBounds = {
        x: bounds.x - 2,
        y: bounds.y - 2,
        width: bounds.width + 4,
        height: bounds.height + 4,
      };
      renderer.drawRect(
        borderBounds,
        {
          strokeStyle: overlayStrokeColor,
          lineWidth: 2,
          dashPattern: [overlayDash, overlayDash],
        },
        this.containerId
      );
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
    return LABEL_ARCHETYPE_PRIORITY.CLASSIFICATION;
  }
}
