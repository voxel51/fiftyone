/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Undoable } from "@fiftyone/commands";
import type { MaskSnapshot } from "../overlay/MaskCanvas";
import type { DetectionOverlay } from "../overlay/DetectionOverlay";
import type { Rect } from "../types";

/**
 * Undoable command for a single paint stroke (pointer-down to pointer-up).
 * Stores before/after canvas snapshots and overlay bounds so that undo
 * restores pixel data and redo re-applies it, both synchronously.
 */
export class PaintStrokeCommand implements Undoable {
  readonly id: string;

  constructor(
    private overlay: DetectionOverlay,
    overlayId: string,
    private beforeSnapshot: MaskSnapshot | undefined,
    private beforeBounds: Rect | undefined,
    private afterSnapshot: MaskSnapshot | undefined,
    private afterBounds: Rect | undefined
  ) {
    this.id = `paint-${overlayId}-${Date.now()}`;
  }

  execute(): void {
    this.overlay.restoreMaskSnapshot(this.afterSnapshot, this.afterBounds);
  }

  undo(): void {
    this.overlay.restoreMaskSnapshot(this.beforeSnapshot, this.beforeBounds);
  }
}
