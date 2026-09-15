/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Selectable } from "../selection/Selectable";
import { BaseOverlay } from "./BaseOverlay";
import { chipStackFor, drawLabelChip, leaveChipStack } from "./labelChip";

import type { Renderer2D } from "../renderer/Renderer2D";
import type { Point, RawLookerLabel, RenderMeta } from "../types";

import { LABEL_ARCHETYPE_PRIORITY } from "../constants";

export type RegressionLabel = NonNullable<RawLookerLabel> & {
  value?: number | null;
  confidence?: number;
};

/**
 * Options for creating a regression overlay.
 */
export interface RegressionOptions {
  id: string;
  field: string;
  label: RegressionLabel;
}

/**
 * A `Regression` chip in the scene's shared top-left stack: the numeric
 * value, then its confidence.
 */
export class RegressionOverlay
  extends BaseOverlay<RegressionLabel>
  implements Selectable
{
  private isSelectedState = false;
  private channel: string | undefined = undefined;

  constructor(options: RegressionOptions) {
    super(options.id, options.field, options.label);
  }

  setEventChannel(eventChannel: string | undefined): void {
    super.setEventChannel(eventChannel);
    this.channel = eventChannel;

    chipStackFor(this.channel).add(this);
  }

  /** The stack's sort key; zero is a value, null is not. */
  get chipText(): string | undefined {
    const value = this.label?.value;
    return value === null || value === undefined ? undefined : `${value}`;
  }

  public get label(): RegressionLabel {
    return super.label;
  }

  public set label(value: RegressionLabel) {
    super.label = value;

    chipStackFor(this.channel).markAllDirty();
  }

  getCursor(_worldPoint: Point, _scale: number): string {
    return "pointer";
  }

  getOverlayType(): string {
    return "RegressionOverlay";
  }

  get containerId() {
    return this.id;
  }

  protected renderImpl(renderer: Renderer2D, renderMeta: RenderMeta): void {
    renderer.dispose(this.containerId);

    const style = this.getCurrentStyle();
    if (!style) return;

    drawLabelChip(renderer, this.containerId, style, renderMeta, {
      text: this.chipText,
      placeholder: "no value",
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
    return LABEL_ARCHETYPE_PRIORITY.REGRESSION;
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
      type: "Regression",
    };
  }

  destroy(): void {
    leaveChipStack(this.channel, this);
    super.destroy();
  }
}
