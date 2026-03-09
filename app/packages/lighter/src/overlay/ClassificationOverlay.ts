/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Selectable } from "../selection/Selectable";
import { BaseOverlay } from "./BaseOverlay";

import type { Renderer2D } from "../renderer/Renderer2D";
import type { Point, RawLookerLabel, RenderMeta } from "../types";

import {
  LABEL_ARCHETYPE_PRIORITY,
  TAB_DASH_HOVERED,
  TAB_DASH_SELECTED,
  TAB_DASH_WIDTH,
} from "../constants";

/**
 * Options for creating a classification overlay.
 */
export interface ClassificationOptions {
  id: string;
  field: string;
  label: RawLookerLabel;
}

const activeClassifications = new Map<string, ClassificationOverlay>();

/**
 * Classification overlay implementation with selection support.
 */
export class ClassificationOverlay extends BaseOverlay implements Selectable {
  private isSelectedState = false;

  constructor(options: ClassificationOptions) {
    super(options.id, options.field, options.label);
    activeClassifications.set(this.id, this);
  }

  private getStackIndex(): number {
    let index = 0;
    for (const overlay of activeClassifications.values()) {
      if (overlay === this) return index;
      index++;
    }
    return 0;
  }

  getCursor(_worldPoint: Point, _scale: number): string {
    return "pointer";
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

    const { x, y } = renderMeta.canonicalMediaBounds;
    const labelPosition = { x, y };

    const hasLabel = !!this.label?.label;

    const confidence =
      this.label?.confidence && !isNaN(this.label.confidence)
        ? this.label.confidence
        : "";

    const textToDraw = hasLabel
      ? `${this.label?.label} ${confidence}`.trim()
      : "select classification...";

    const outlineDash = this.isSelected()
      ? TAB_DASH_SELECTED
      : TAB_DASH_HOVERED;

    const dashline =
      this.isSelected() || this.isHovered()
        ? {
            strokeStyle: "#FFFFFF",
            lineWidth: TAB_DASH_WIDTH,
            dashPattern: [outlineDash, outlineDash],
          }
        : undefined;

    const backgroundColor = hasLabel
      ? style.fillStyle || style.strokeStyle || "#000"
      : "#808080";

    this.textBounds = renderer.drawText(
      textToDraw,
      labelPosition,
      {
        fontColor: "#FFFFFF",
        fontStyle: hasLabel ? "normal" : "italic",
        backgroundColor,
        anchor: { vertical: "top" },
        offset: { bottom: this.getStackIndex() },
        rounded: 4,
        tab: "right",
        dashline,
      },
      this.containerId
    );

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

  destroy(): void {
    activeClassifications.delete(this.id);
    super.destroy();
  }
}
