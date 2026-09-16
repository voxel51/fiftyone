/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Undoable } from "@fiftyone/commands";
import type { KeypointOverlay } from "../overlay/KeypointOverlay";

/**
 * Undoable command for moving a single point within a KeypointOverlay.
 */
export class MoveKeypointPointCommand implements Undoable {
  readonly id: string;
  readonly description: string;

  /**
   * @param emit - When `false`, moves silently (no `keypoint-point-moved`, no
   *   engine commit) across execute/undo/redo. Keypoint creation drafts use
   *   this: they persist once, on completion, never per placement.
   */
  constructor(
    private overlay: KeypointOverlay,
    private pointId: string,
    private from: [number, number],
    private to: [number, number],
    private emit = true,
  ) {
    this.id = `move-keypoint-point-${pointId}-${Date.now()}`;
    this.description = `Move keypoint point ${pointId}`;
  }

  execute(): void {
    this.overlay.movePointById(this.pointId, this.to, this.emit);
  }

  undo(): void {
    this.overlay.movePointById(this.pointId, this.from, this.emit);
  }
}
