/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Command } from "../Command";
import type { Rect } from "../../types";

/**
 * Command for moving a bounding box annotation.
 */
export class MoveBoundingBoxCommand implements Command {
  readonly id: string;
  readonly description: string;

  constructor(
    private annotationId: string,
    private oldBounds: Rect,
    private newBounds: Rect,
    private updateCallback: (id: string, bounds: Rect) => void
  ) {
    this.id = `move-bbox-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    this.description = `Move bounding box ${annotationId}`;
  }

  execute(): void {
    this.updateCallback(this.annotationId, this.newBounds);
  }

  undo(): void {
    this.updateCallback(this.annotationId, this.oldBounds);
  }

  /**
   * Gets the annotation ID.
   * @returns The annotation ID.
   */
  getAnnotationId(): string {
    return this.annotationId;
  }

  /**
   * Gets the old bounds.
   * @returns The old bounds.
   */
  getOldBounds(): Rect {
    return this.oldBounds;
  }

  /**
   * Gets the new bounds.
   * @returns The new bounds.
   */
  getNewBounds(): Rect {
    return this.newBounds;
  }
}
