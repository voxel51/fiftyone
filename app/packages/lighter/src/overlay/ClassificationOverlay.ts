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

/** The fields the chip reads off a `Classification` or `Regression`. */
type ChipLabel = NonNullable<RawLookerLabel> & {
  _cls?: string;
  label?: string;
  value?: number;
  confidence?: number;
};

/**
 * Per-channel registry of active classification overlays.
 * Keyed by event channel so overlays from different scenes don't interfere.
 */
const channelRegistry = new Map<
  string | undefined,
  Map<string, ClassificationOverlay>
>();

function getChannelMap(
  channel: string | undefined,
): Map<string, ClassificationOverlay> {
  let map = channelRegistry.get(channel);
  if (!map) {
    map = new Map();
    channelRegistry.set(channel, map);
  }
  return map;
}

/**
 * Classification overlay implementation with selection support. A
 * `Regression` label renders through the same chip, showing its `value`.
 */
export class ClassificationOverlay extends BaseOverlay implements Selectable {
  private isSelectedState = false;
  private channel: string | undefined = undefined;

  constructor(options: ClassificationOptions) {
    super(options.id, options.field, options.label);
  }

  setEventChannel(eventChannel: string | undefined): void {
    super.setEventChannel(eventChannel);
    this.channel = eventChannel;

    getChannelMap(this.channel).set(this.id, this);
  }

  private get chip(): ChipLabel | null {
    return this.label as ChipLabel | null;
  }

  private get isRegression(): boolean {
    return this.chip?._cls === "Regression";
  }

  /** The chip's primary text: a Regression's `value`, else the class name. */
  private get primaryText(): string | undefined {
    if (this.isRegression) {
      const value = this.chip?.value;
      return value === null || value === undefined ? undefined : `${value}`;
    }

    return this.chip?.label || undefined;
  }

  // The "stack index" is the order in which Classifications are drawn to the scene.
  // They are displayed vertically in the upper-left of the scene and sorted alphabetically by label class.
  private getStackIndex(): number {
    const siblings = getChannelMap(this.channel);
    const alphabetical = [...siblings.values()].sort((a, b) =>
      (a.primaryText ?? "").localeCompare(b.primaryText ?? ""),
    );

    return alphabetical.indexOf(this);
  }

  public get label(): RawLookerLabel {
    return super.label;
  }

  public set label(value: RawLookerLabel) {
    super.label = value;

    getChannelMap(this.channel).forEach((classificationOverlay) =>
      classificationOverlay.markDirty(),
    );
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

    const primary = this.primaryText;
    const hasLabel = primary !== undefined;

    const confidence =
      this.chip?.confidence && !isNaN(this.chip.confidence)
        ? this.chip.confidence
        : "";

    const textToDraw = hasLabel
      ? `${primary} ${confidence}`.trim()
      : this.isRegression
        ? "no value"
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
      this.containerId,
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
      type: this.isRegression ? "Regression" : "Classification",
    };
  }

  destroy(): void {
    const map = getChannelMap(this.channel);
    map.delete(this.id);

    if (map.size === 0) {
      channelRegistry.delete(this.channel);
    }

    super.destroy();
  }

  /** Test-only: forget every channel's stack. */
  static _resetRegistry(): void {
    channelRegistry.clear();
  }
}
