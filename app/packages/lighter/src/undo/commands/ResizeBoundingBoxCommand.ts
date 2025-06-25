/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Command } from "../Command";
import type { Rect } from "../../types";

/**
 * Command for resizing a bounding box annotation.
 */
export class ResizeBoundingBoxCommand implements Command {
  readonly id: string;
  readonly description: string;

  constructor(
    private annotationId: string,
    private oldBounds: Rect,
    private newBounds: Rect,
    private resizeHandle: string,
    private updateCallback: (id: string, bounds: Rect) => void
  ) {
    this.id = `resize-bbox-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    this.description = `Resize bounding box ${annotationId} from ${resizeHandle}`;
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

  /**
   * Gets the resize handle that was used.
   * @returns The resize handle.
   */
  getResizeHandle(): string {
    return this.resizeHandle;
  }
}
