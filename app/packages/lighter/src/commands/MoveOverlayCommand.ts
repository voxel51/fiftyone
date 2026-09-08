/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Undoable } from "@fiftyone/commands";
import type { Rect, Spatial } from "../types";

/**
 * Command for moving an overlay with undo/redo support.
 */
export class MoveOverlayCommand implements Undoable {
  readonly id: string;
  readonly description: string;

  constructor(
    private overlay: Spatial,
    overlayId: string,
    private oldBounds: Rect,
    private newBounds: Rect,
  ) {
    this.id = `move-${overlayId}-${Date.now()}`;
    this.description = `Move overlay ${overlayId}`;
  }

  execute(): void {
    this.overlay.bounds = this.newBounds;
  }

  undo(): void {
    this.overlay.bounds = this.oldBounds;
  }
}
