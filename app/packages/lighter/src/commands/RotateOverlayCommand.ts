/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Undoable } from "@fiftyone/commands";
import type { Rotatable } from "../types";

/**
 * Command for rotating an overlay with undo/redo support.
 */
export class RotateOverlayCommand implements Undoable {
  readonly id: string;
  readonly description: string;

  constructor(
    private overlay: Rotatable,
    overlayId: string,
    private oldRotation: number,
    private newRotation: number,
  ) {
    this.id = `rotate-${overlayId}-${Date.now()}`;
    this.description = `Rotate overlay ${overlayId}`;
  }

  execute(): void {
    this.overlay.setRotation(this.newRotation);
  }

  undo(): void {
    this.overlay.setRotation(this.oldRotation);
  }
}
