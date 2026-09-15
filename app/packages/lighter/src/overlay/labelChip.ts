/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Renderer2D } from "../renderer/Renderer2D";
import type { DrawStyle, Rect, RenderMeta } from "../types";

import {
  TAB_DASH_HOVERED,
  TAB_DASH_SELECTED,
  TAB_DASH_WIDTH,
} from "../constants";

/** What a chip contributes to the shared stack: an id, a sort key, a repaint. */
export interface ChipEntry {
  readonly id: string;
  /** The chip's own text; `undefined` sorts first and paints a placeholder. */
  readonly chipText: string | undefined;
  markDirty(): void;
}

/**
 * The column of chips in a scene's top-left, in text order. Every non-spatial
 * label on the scene (Classification, Regression) shares one stack so they
 * order against each other rather than overpainting.
 */
export class ChipStack {
  private readonly entries = new Map<string, ChipEntry>();

  add(entry: ChipEntry): void {
    this.entries.set(entry.id, entry);
  }

  remove(entry: ChipEntry): void {
    this.entries.delete(entry.id);
  }

  get size(): number {
    return this.entries.size;
  }

  indexOf(entry: ChipEntry): number {
    const sorted = [...this.entries.values()].sort((a, b) =>
      (a.chipText ?? "").localeCompare(b.chipText ?? ""),
    );

    return sorted.indexOf(entry);
  }

  /** A sort key changed, so every neighbour's index may have moved. */
  markAllDirty(): void {
    this.entries.forEach((entry) => entry.markDirty());
  }
}

const stacks = new Map<string | undefined, ChipStack>();

/** The stack for an event channel; scenes never share one. */
export const chipStackFor = (channel: string | undefined): ChipStack => {
  let stack = stacks.get(channel);
  if (!stack) {
    stack = new ChipStack();
    stacks.set(channel, stack);
  }
  return stack;
};

/** Drop a chip from its channel's stack, forgetting the stack once empty. */
export const leaveChipStack = (
  channel: string | undefined,
  entry: ChipEntry,
): void => {
  const stack = stacks.get(channel);
  if (!stack) return;

  stack.remove(entry);
  if (stack.size === 0) {
    stacks.delete(channel);
  }
};

/** Test-only: forget every channel's stack. */
export const _resetChipStacks = (): void => {
  stacks.clear();
};

export interface LabelChipSpec {
  /** The chip's own text; when missing the placeholder paints in italics. */
  text: string | undefined;
  placeholder: string;
  confidence?: number | null;
  stackIndex: number;
  selected: boolean;
  hovered: boolean;
}

/** Paint one chip at the media's top-left, offset down by its stack index. */
export const drawLabelChip = (
  renderer: Renderer2D,
  containerId: string,
  style: DrawStyle,
  renderMeta: RenderMeta,
  spec: LabelChipSpec,
): Rect => {
  const { x, y } = renderMeta.canonicalMediaBounds;
  const hasText = spec.text !== undefined;

  const confidence =
    spec.confidence && !isNaN(spec.confidence) ? spec.confidence : "";

  const textToDraw = hasText
    ? `${spec.text} ${confidence}`.trim()
    : spec.placeholder;

  const outlineDash = spec.selected ? TAB_DASH_SELECTED : TAB_DASH_HOVERED;

  const dashline =
    spec.selected || spec.hovered
      ? {
          strokeStyle: "#FFFFFF",
          lineWidth: TAB_DASH_WIDTH,
          dashPattern: [outlineDash, outlineDash],
        }
      : undefined;

  const backgroundColor = hasText
    ? style.fillStyle || style.strokeStyle || "#000"
    : "#808080";

  return renderer.drawText(
    textToDraw,
    { x, y },
    {
      fontColor: "#FFFFFF",
      fontStyle: hasText ? "normal" : "italic",
      backgroundColor,
      anchor: { vertical: "top" },
      offset: { bottom: spec.stackIndex },
      rounded: 4,
      tab: "right",
      dashline,
    },
    containerId,
  );
};
