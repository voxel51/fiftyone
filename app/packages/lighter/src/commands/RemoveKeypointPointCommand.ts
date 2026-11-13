/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Undoable } from "@fiftyone/commands";
import type { KeypointOverlay } from "../overlay/KeypointOverlay";

/**
 * Undoable command for removing a single point from a KeypointOverlay.
 *
 * Constructor captures the point's relative position and variant so undo
 * can re-add it with the same ID.
 */
export class RemoveKeypointPointCommand implements Undoable {
  readonly id: string;
  readonly description: string;

  private readonly relativePosition: [number, number];
  private readonly variant?: string;

  /**
   * @param silent - When `true`, removes/re-adds without dispatching point
   *   events (no engine commit) across execute/undo/redo. Keypoint creation
   *   drafts use this: they persist once, on completion, never per placement.
   */
  constructor(
    private overlay: KeypointOverlay,
    private pointId: string,
    private silent = false,
  ) {
    const entry = overlay.getPointById(pointId);
    if (!entry) {
      throw new Error(
        `RemoveKeypointPointCommand: no point with id ${pointId}`,
      );
    }

    this.relativePosition = entry.position;
    this.variant = entry.variant;
    this.id = `remove-keypoint-point-${pointId}-${Date.now()}`;
    this.description = `Remove keypoint point ${pointId}`;
  }

  execute(): void {
    this.overlay.removePointById(this.pointId, this.silent);
  }

  undo(): void {
    const worldPoint = this.overlay.relativePointToAbsolute(
      this.relativePosition,
    );
    this.overlay.addPoint(worldPoint, {
      variant: this.variant,
      id: this.pointId,
      silent: this.silent,
    });
  }
}
