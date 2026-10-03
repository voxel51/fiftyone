/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Selectable } from "../selection/Selectable";
import { BaseOverlay } from "./BaseOverlay";
import { chipStackFor, drawLabelChip, leaveChipStack } from "./labelChip";

import type { Renderer2D } from "../renderer/Renderer2D";
import type { Point, RawLookerLabel, RenderMeta } from "../types";

import { LABEL_ARCHETYPE_PRIORITY } from "../constants";

export type ClassificationLabel = NonNullable<RawLookerLabel> & {
  label?: string;
  confidence?: number;
};

/**
 * Options for creating a classification overlay.
 */
export interface ClassificationOptions {
  id: string;
  field: string;
  label: RawLookerLabel;
}

/**
 * A `Classification` chip in the scene's shared top-left stack: the class
 * name, then its confidence.
 */
export class ClassificationOverlay
  extends BaseOverlay<ClassificationLabel>
  implements Selectable
{
  private isSelectedState = false;
  private channel: string | undefined = undefined;

  constructor(options: ClassificationOptions) {
    super(options.id, options.field, options.label as ClassificationLabel);
  }

  setEventChannel(eventChannel: string | undefined): void {
    super.setEventChannel(eventChannel);
    this.channel = eventChannel;

    chipStackFor(this.channel).add(this);
  }

  /** The stack's sort key. */
  get chipText(): string | undefined {
    return this.label?.label || undefined;
  }

  public get label(): ClassificationLabel {
    return super.label;
  }

  public set label(value: ClassificationLabel) {
    super.label = value;

    chipStackFor(this.channel).markAllDirty();
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
    const style = this.getCurrentStyle();
    if (!style) return;

    drawLabelChip(renderer, this.containerId, style, renderMeta, {
      text: this.chipText,
      placeholder: "select classification...",
      confidence: this.label?.confidence,
      stackIndex: chipStackFor(this.channel).indexOf(this),
      selected: this.isSelected(),
      hovered: this.isHovered(),
    });

    this.emitLoaded();
  }

  // Selectable interface implementation
  isSelected(): boolean {
    return this.isSelectedState;
  }

  setSelected(selected: boolean): void {
    if (this.isSelectedState !== selected) {
      this.isSelectedState = selected;
      this.markDirty();
    }
  }

  toggleSelected(): boolean {
    this.setSelected(!this.isSelectedState);
    return this.isSelectedState;
  }

  getSelectionPriority(): number {
    return LABEL_ARCHETYPE_PRIORITY.CLASSIFICATION;
  }

  getTooltipInfo(): {
    color: string;
    field: string;
    label: any;
    type: string;
  } | null {
    return {
      color: this.getCurrentStyle()?.fillStyle ?? "#ffffff",
      field: this.field || "unknown",
      label: this.label,
      type: "Classification",
    };
  }

  destroy(): void {
    leaveChipStack(this.channel, this);
    super.destroy();
  }
}
