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

  constructor(
    private overlay: KeypointOverlay,
    private pointId: string,
    private from: [number, number],
    private to: [number, number]
  ) {
    this.id = `move-keypoint-point-${pointId}-${Date.now()}`;
    this.description = `Move keypoint point ${pointId}`;
  }

  execute(): void {
    this.overlay.movePointById(this.pointId, this.to);
  }

  undo(): void {
    this.overlay.movePointById(this.pointId, this.from);
  }
}
