/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Undoable } from "@fiftyone/commands";
import type { Rect } from "../types";
import type { Movable } from "./MoveOverlayCommand";

/**
 * Command for transforming an overlay with undo/redo support.
 */
export class TransformOverlayCommand implements Undoable {
  readonly id: string;
  readonly description: string;

  constructor(
    private overlay: Movable,
    overlayId: string,
    private oldBounds: Rect,
    private newBounds: Rect
  ) {
    this.id = `transform-${overlayId}-${Date.now()}`;
    this.description = `Transform overlay ${overlayId}`;
  }

  execute(): void {
    this.overlay.bounds = this.newBounds;
  }

  undo(): void {
    this.overlay.bounds = this.oldBounds;
  }
}
