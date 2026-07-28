/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Undoable } from "@fiftyone/commands";
import type { DetectionOverlay } from "../overlay/DetectionOverlay";
import type { Point } from "../types";

/**
 * Undoable command for adding a single keypoint to a pen-tool polygon-in-progress
 * on a {@link DetectionOverlay}.
 *
 * Mirrors {@link AddPolylinePointCommand}: undo removes the point, redo
 * re-adds it at the same world position with the same id so connection
 * topology stays stable across undo/redo cycles.
 */
export class AddMaskKeypointCommand implements Undoable {
  readonly id: string;
  readonly description: string;

  constructor(
    private overlay: DetectionOverlay,
    private pointId: string,
    private worldPoint: Point,
    private variant?: string,
  ) {
    this.id = `add-mask-keypoint-${pointId}-${Date.now()}`;
    this.description = `Add mask keypoint ${pointId}`;
  }

  execute(): void {
    this.overlay.addMaskKeypoint(this.worldPoint, {
      id: this.pointId,
      variant: this.variant,
    });
  }

  undo(): void {
    this.overlay.removeMaskKeypointById(this.pointId);
  }
}
