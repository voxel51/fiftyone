/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import {
  FONT_SIZE,
  LABEL_ARCHETYPE_PRIORITY,
  SELECTED_DASH_LENGTH,
} from "../constants";
import type { Renderer2D } from "../renderer/Renderer2D";
import { Selectable } from "../selection/Selectable";
import { RawLookerLabel, Rect, RenderMeta } from "../types";
import { BaseOverlay } from "./BaseOverlay";

/**
 * Options for creating a classification overlay.
 */
export interface ClassificationOptions {
  id: string;
  field: string;
  label: RawLookerLabel;
}

/**
 * Classification overlay implementation with selection support.
 */
export class ClassificationOverlay extends BaseOverlay implements Selectable {
  private isSelectedState = false;
  private textBounds?: Rect;

  constructor(options: ClassificationOptions) {
    super(options.id, options.field, options.label);
  }

  getOverlayType(): string {
    return "ClassificationOverlay";
  }

  get containerId() {
    return this.id;
  }

  protected renderImpl(renderer: Renderer2D, renderMeta: RenderMeta): void {
    // Dispose of old elements before creating new ones
    renderer.dispose(this.containerId);

    const style = this.getCurrentStyle();
    if (!style) return;

    if (this.label && this.label?.label) {
      const { x, y } = renderMeta.canonicalMediaBounds;
      const labelPosition = { x, y };

      const confidence =
        this.label.confidence && !isNaN(this.label.confidence)
          ? this.label.confidence
          : "";
      const textToDraw = `${this.label?.label} ${confidence}`.trim();

      this.textBounds = renderer.drawText(
        textToDraw,
        labelPosition,
        {
          fontColor: "#ffffff",
          backgroundColor: style.fillStyle || style.strokeStyle || "#000",
          anchor: { vertical: "top" },
          offset: { bottom: renderMeta.overlayIndex },
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
