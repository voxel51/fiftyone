/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Undoable } from "@fiftyone/commands";
import type { KeypointOverlay } from "../overlay/KeypointOverlay";

/**
 * Undoable command for adding a single point to a KeypointOverlay.
 */
export class AddKeypointPointCommand implements Undoable {
  readonly id: string;
  readonly description: string;

  constructor(
    private overlay: KeypointOverlay,
    private pointId: string,
    private relativePosition: [number, number],
    private variant?: string
  ) {
    this.id = `add-keypoint-point-${pointId}-${Date.now()}`;
    this.description = `Add keypoint point ${pointId}`;
  }

  execute(): void {
    const worldPoint = this.overlay.relativePointToAbsolute(
      this.relativePosition
    );
    this.overlay.addPoint(worldPoint, this.variant, this.pointId);
  }

  undo(): void {
    this.overlay.removePointById(this.pointId);
  }
}
