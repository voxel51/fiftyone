/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

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
    private newBounds: Rect
  ) {
    this.id = `transform-${overlayId}-${Date.now()}`;
    this.description = `Transform overlay ${overlayId}`;
  }

  execute(): void {
    this.overlay.setBounds(this.newBounds);
  }

  undo(): void {
    this.overlay.setBounds(this.oldBounds);
  }
}
