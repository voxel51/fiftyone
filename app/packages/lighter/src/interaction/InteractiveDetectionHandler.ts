/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { BoundingBoxOverlay } from "../overlay/BoundingBoxOverlay";
import type { Point, Rect } from "../types";
import type { InteractionHandler } from "./InteractionManager";

const INTERACTIVE_DETECTION_HANDLER_ID = "interactive-detection-handler";

const MIN_PIXELS = 2;

/**
 * Interactive detection handler for creating bounding box annotations.
 */
export class InteractiveDetectionHandler implements InteractionHandler {
  readonly id = INTERACTIVE_DETECTION_HANDLER_ID;
  readonly cursor = "crosshair";

  private isDragging = false;
  private startPoint?: Point;
  private currentBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  constructor(private overlay: BoundingBoxOverlay) {}

  containsPoint(): boolean {
    return true;
  }

  getOverlay(): BoundingBoxOverlay {
    return this.overlay;
  }

  resetOverlay(): void {
    this.overlay.unsetBounds();
  }

  markDirty(): void {
    this.overlay.markDirty();
  }

  onPointerDown(point: Point, _, event: PointerEvent): boolean {
    this.startPoint = point;
    this.isDragging = true;
    this.overlay.toggleSelected();
    this.overlay.setBounds({
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
    });

    return true;
  }

  onDrag(point: Point, event: PointerEvent): boolean {
    if (!this.isDragging || !this.startPoint) return false;

    // Calculate bounds from start point to current point
    const x = Math.min(this.startPoint.x, point.x);
    const y = Math.min(this.startPoint.y, point.y);
    const width = Math.abs(point.x - this.startPoint.x);
    const height = Math.abs(point.y - this.startPoint.y);

    this.overlay.setBounds({ x, y, width, height });

    return true;
  }

  onPointerUp(_point: Point, _event: PointerEvent): boolean {
    if (!this.isDragging || !this.startPoint) {
      this.isDragging = false;
      return false;
    }

    const tempBounds = this.overlay.getAbsoluteBounds();

    // Only create detection if we have a meaningful size
    const minSize = MIN_PIXELS;
    if (tempBounds.width < minSize || tempBounds.height < minSize) {
      this.isDragging = false;

      return true;
    }

    return true;
  }
}
