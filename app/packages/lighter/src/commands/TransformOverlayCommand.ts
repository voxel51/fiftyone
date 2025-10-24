/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { BoundingBoxOverlay } from "../overlay/BoundingBoxOverlay";
import type { Rect } from "../types";
import type { Command } from "./Command";
import { Movable } from "./MoveOverlayCommand";

/**
 * Options for transforming an overlay.
 */
export interface TransformOptions {
  /** New bounds for the overlay */
  bounds?: Rect;
  /** New scale factors */
  scale?: { x: number; y: number };
}

/**
 * Command for transforming an overlay with undo/redo support.
 */
export class TransformOverlayCommand implements Command {
  readonly id: string;
  readonly description: string;

  constructor(
    private overlay: Movable,
    overlayId: string,
    private oldBounds: Rect,
    private newBounds: Rect,
    private relative?: boolean
  ) {
    this.id = `transform-${overlayId}-${Date.now()}`;
    this.description = `Transform overlay ${overlayId}`;
  }

  execute(): void {
    if (this.relative && this.overlay instanceof BoundingBoxOverlay) {
      this.overlay.setRelativeBounds(this.newBounds);
    } else {
      this.overlay.setBounds(this.newBounds);
    }

    this.overlay.markDirty();
  }

  undo(): void {
    this.overlay.setBounds(this.oldBounds);
  }
}
