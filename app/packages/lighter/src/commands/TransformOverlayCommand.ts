/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Undoable } from "@fiftyone/commands";
import type { Rect } from "../types";
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

  async execute(): Promise<void> {
    this.overlay.setBounds(this.newBounds);
  }

  async undo(): Promise<void> {
    this.overlay.setBounds(this.oldBounds);
  }
}
