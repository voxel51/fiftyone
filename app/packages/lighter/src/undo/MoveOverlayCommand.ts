/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Command } from "./Command";
import type { Point } from "../types";

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
   * Mark the overlay as dirty to trigger re-render.
   */
  markDirty(): void;
}

/**
 * Command for moving an overlay with undo/redo support.
 */
export class MoveOverlayCommand implements Command {
  readonly id: string;
  readonly description: string;

  constructor(
    private overlay: Movable,
    private overlayId: string,
    private oldPosition: Point,
    private newPosition: Point
  ) {
    this.id = `move-${overlayId}-${Date.now()}`;
    this.description = `Move overlay ${overlayId}`;
  }

  execute(): void {
    this.overlay.setPosition(this.newPosition);
    this.overlay.markDirty();
  }

  undo(): void {
    this.overlay.setPosition(this.oldPosition);
    this.overlay.markDirty();
  }
}
