/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Undoable } from "@fiftyone/commands";
import type { DetectionOverlay } from "../overlay/DetectionOverlay";
import type { PaintStrokeData } from "../overlay/MaskCanvas";

export interface MergeDetectionsCommandDeps {
  /** Persists deletion of the source label to the backend. */
  deleteSource: () => void | Promise<void>;
  /** Restores the source label; overlay/row hydration follows from it. */
  restoreSource: () => void | Promise<void>;
}

/**
 * Undoable command for merging one detection's mask into another and deleting
 * the source detection. Composite: pixel-level mask state is restored via
 * the target overlay's mask snapshot, and the source detection is
 * deleted/re-added through caller-provided callbacks so persistence and
 * sidebar wiring stay in the React layer.
 *
 * The initial merge work happens before this command is constructed (see the
 * merge tool hook). `execute` is the redo path — it re-applies the post-merge
 * mask and re-deletes the source.
 */
export class MergeDetectionsCommand implements Undoable {
  readonly id: string;

  constructor(
    private target: DetectionOverlay,
    private paintData: PaintStrokeData,
    private deps: MergeDetectionsCommandDeps,
    targetId: string,
    sourceId: string
  ) {
    this.id = `merge-${targetId}-${sourceId}-${Date.now()}`;
  }

  async execute(): Promise<void> {
    this.target.restoreMaskSnapshot(
      this.paintData.afterSnapshot,
      this.paintData.afterBounds
    );
    await this.deps.deleteSource();
  }

  async undo(): Promise<void> {
    this.target.restoreMaskSnapshot(
      this.paintData.beforeSnapshot,
      this.paintData.beforeBounds
    );
    await this.deps.restoreSource();
  }
}
