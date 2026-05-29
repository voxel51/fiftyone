/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Selectable } from "../selection/Selectable";
import { BaseOverlay } from "./BaseOverlay";

import type { Renderer2D } from "../renderer/Renderer2D";
import type { Point, RawLookerLabel, Rect, RenderMeta } from "../types";

import {
  LABEL_ARCHETYPE_PRIORITY,
  TAB_DASH_HOVERED,
  TAB_DASH_SELECTED,
  TAB_DASH_WIDTH,
} from "../constants";

/** A `TemporalDetection` label, with the support range driving the gate. */
export type TemporalDetectionLabel = NonNullable<RawLookerLabel> & {
  /** 1-indexed inclusive `[first, last]` frame range. */
  support: [number, number];
  label?: string;
  confidence?: number;
};

export interface TemporalDetectionOptions {
  id: string;
  field: string;
  label: TemporalDetectionLabel;
}

/**
 * Per-channel registry of active TD overlays. Separate from
 * ClassificationOverlay's so the two don't intermix in stack ordering;
 * TDs render in the canvas's top-right corner, Classifications in the
 * top-left.
 */
const channelRegistry = new Map<
  string | undefined,
  Map<string, TemporalDetectionOverlay>
>();

function getChannelMap(
  channel: string | undefined
): Map<string, TemporalDetectionOverlay> {
  let map = channelRegistry.get(channel);
  if (!map) {
    map = new Map();
    channelRegistry.set(channel, map);
  }
  return map;
}

/**
 * Temporal Detection "tag" overlay.
 *
 * The frame is pushed in via {@link setCurrentFrame} by the surface's
 * TD overlay source — overlays don't take a dependency on the
 * playback engine themselves. Crossing a support boundary flips an
 * internal `isActive` flag, marks the overlay dirty, and ripples a
 * dirty signal to every sibling TD overlay so the stack indices
 * reflow without leaving visual gaps when a neighbour becomes
 * inactive.
 */
export class TemporalDetectionOverlay
  extends BaseOverlay<TemporalDetectionLabel>
  implements Selectable
{
  private isSelectedState = false;
  private isActiveState = false;
  private channel: string | undefined = undefined;
  private currentFrame: number | null = null;

  constructor(options: TemporalDetectionOptions) {
    super(options.id, options.field, options.label);
    this.recomputeActive();
  }

  setEventChannel(eventChannel: string | undefined): void {
    super.setEventChannel(eventChannel);
    this.channel = eventChannel;

    getChannelMap(this.channel).set(this.id, this);
  }

  /**
   * Update the playhead frame this overlay gates against. Marks dirty
   * only when crossing a support boundary; the source can call this
   * on every playhead tick safely.
   */
  setCurrentFrame(frame: number): void {
    if (this.currentFrame === frame) {
      return;
    }
    this.currentFrame = frame;

    const previous = this.isActiveState;
    this.recomputeActive();

    if (this.isActiveState !== previous) {
      this.markDirty();
      // Active siblings' stack indices shift when this one enters or
      // leaves — they need a re-render too. Inactive siblings skip:
      // their render is a no-op, dirtying them just wastes a tick.
      getChannelMap(this.channel).forEach((o) => {
        if (o !== this && o.isActive()) o.markDirty();
      });
    }
  }

  isActive(): boolean {
    return this.isActiveState;
  }

  public override get label(): TemporalDetectionLabel {
    return super.label;
  }

  public override set label(value: TemporalDetectionLabel) {
    super.label = value;
    // Re-gate after a label edit (e.g. support range changed by drag).
    this.recomputeActive();
    // Self is already dirty from BaseOverlay's setter; ripple to
    // active siblings whose stack-index ordering may shift if our
    // label string (sort key) changed.
    getChannelMap(this.channel).forEach((o) => {
      if (o !== this && o.isActive()) o.markDirty();
    });
  }

  /**
   * Stack index among the currently-active siblings, sorted
   * alphabetically by label. Inactive siblings are filtered out so
   * the rendered column has no gaps.
   */
  private getActiveStackIndex(): number {
    const active = [...getChannelMap(this.channel).values()]
      .filter((s) => s.isActive())
      .sort((a, b) =>
        (a.label?.label ?? "").localeCompare(b.label?.label ?? "")
      );
    return active.indexOf(this);
  }

  private recomputeActive(): void {
    const support = this.label?.support;
    const frame = this.currentFrame;
    this.isActiveState =
      Array.isArray(support) &&
      typeof frame === "number" &&
      frame >= support[0] &&
      frame <= support[1];
  }

  getCursor(_worldPoint: Point, _scale: number): string {
    return "pointer";
  }

  getOverlayType(): string {
    return "TemporalDetectionOverlay";
  }

  get containerId() {
    return this.id;
  }

  protected renderImpl(renderer: Renderer2D, renderMeta: RenderMeta): void {
    renderer.dispose(this.containerId);

    // Out support window: render nothing. The container has been disposed
    // so the previous tag (if any) is removed; we early-return before
    // re-creating anything.
    if (!this.isActiveState) {
      return;
    }

    const style = this.getCurrentStyle();
    if (!style) return;

    const { x, y, width } = renderMeta.canonicalMediaBounds;
    const labelPosition = { x: x + width, y };

    const hasLabel = !!this.label?.label;

    const confidence =
      this.label?.confidence !== undefined && !isNaN(this.label.confidence)
        ? this.label.confidence
        : "";

    const textToDraw = hasLabel
      ? `${this.label?.label} ${confidence}`.trim()
      : "temporal detection";

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
        anchor: { vertical: "top", horizontal: "right" },
        offset: { bottom: this.getActiveStackIndex() },
        rounded: 4,
        tab: "left",
        dashline,
      },
      this.containerId
    );

    this.emitLoaded();
  }

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
    return LABEL_ARCHETYPE_PRIORITY.TEMPORAL_DETECTION;
  }

  getTooltipInfo(): {
    color: string;
    field: string;
    label: TemporalDetectionLabel;
    type: string;
  } | null {
    return {
      color: this.getCurrentStyle()?.fillStyle ?? "#ffffff",
      field: this.field || "unknown",
      label: this.label,
      type: "TemporalDetection",
    };
  }

  destroy(): void {
    const map = getChannelMap(this.channel);
    map.delete(this.id);

    if (map.size === 0) {
      channelRegistry.delete(this.channel);
    }

    // Stack indices of remaining active siblings may have shifted.
    map.forEach((o) => {
      if (o.isActive()) o.markDirty();
    });

    super.destroy();
  }

  /** Test seam: drops the module-level registry. */
  static _resetRegistry(): void {
    channelRegistry.clear();
  }

  private textBounds?: Rect;
}
