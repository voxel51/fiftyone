/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Undoable } from "@fiftyone/commands";
import type { Point, Rect } from "../types";

/**
 * Interface for overlays that can be moved.
 */
export interface Movable {
  /**
   * Get the current position of the overlay.
   * @returns The current position.
   */
  getPosition(): Point;

  /**
   * Set the position of the overlay.
   * @param position - The new position.
   */
  setPosition(position: Point): void;

  /**
   * Get the current bounds of the overlay.
   * @returns The current bounds.
   */
  getBounds(): Rect;

  /**
   * Set the bounds of the overlay.
   * @param bounds - The new bounds.
   */
  setBounds(bounds: Rect): void;

  /**
   * Mark the overlay as dirty to trigger re-render.
   */
  markDirty(): void;
}

/**
 * Command for moving an overlay with undo/redo support.
 */
export class MoveOverlayCommand implements Undoable {
  readonly id: string;
  readonly description: string;

  constructor(
    private overlay: Movable,
    overlayId: string,
    private oldBounds: Rect,
    private newBounds: Rect
  ) {
    this.id = `move-${overlayId}-${Date.now()}`;
    this.description = `Move overlay ${overlayId}`;
  }

  async execute(): Promise<void> {
    this.overlay.setBounds(this.newBounds);
  }

  async undo(): Promise<void> {
    this.overlay.setBounds(this.oldBounds);
  }
}
