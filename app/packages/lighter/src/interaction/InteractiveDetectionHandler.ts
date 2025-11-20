/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { BoundingBoxOverlay } from "../overlay/BoundingBoxOverlay";
import type { Point } from "../types";
import type { InteractionHandler } from "./InteractionManager";

const INTERACTIVE_DETECTION_HANDLER_ID = "interactive-detection-handler";

const MIN_PIXELS = 2;

/**
 * Interactive detection handler for creating bounding box annotations.
 */
export class InteractiveDetectionHandler implements InteractionHandler {
  readonly id = INTERACTIVE_DETECTION_HANDLER_ID;
  readonly cursor = "crosshair";

  private _isDragging = false;
  private startPoint?: Point;

  constructor(public readonly overlay: BoundingBoxOverlay) {}

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

  onPointerDown(
    point: Point,
    _worldPoint: Point,
    _event: PointerEvent
  ): boolean {
    this.startPoint = point;
    this._isDragging = true;
    this.overlay.toggleSelected();
    this.overlay.setBounds({
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
    });

    return true;
  }

  isMoving(): boolean {
    return this._isDragging;
  }

  isDragging(): boolean {
    return this._isDragging;
  }

  onMove(
    point: Point,
    _worldPoint: Point,
    _event: PointerEvent,
    _scale: number,
    _maintainAspectRatio?: boolean
  ): boolean {
    if (!this._isDragging || !this.startPoint) return false;

    // Calculate bounds from start point to current point
    const x = Math.min(this.startPoint.x, point.x);
    const y = Math.min(this.startPoint.y, point.y);
    const width = Math.abs(point.x - this.startPoint.x);
    const height = Math.abs(point.y - this.startPoint.y);

    this.overlay.setBounds({ x, y, width, height });

    return true;
  }

  onDrag(point: Point, _event: PointerEvent): boolean {
    if (!this._isDragging || !this.startPoint) return false;

    // Calculate bounds from start point to current point
    const x = Math.min(this.startPoint.x, point.x);
    const y = Math.min(this.startPoint.y, point.y);
    const width = Math.abs(point.x - this.startPoint.x);
    const height = Math.abs(point.y - this.startPoint.y);

    this.overlay.setBounds({ x, y, width, height });

    return true;
  }

  onPointerUp(_point: Point, _event: PointerEvent): boolean {
    if (!this._isDragging || !this.startPoint) {
      this._isDragging = false;
      return false;
    }

    const tempBounds = this.overlay.getAbsoluteBounds();

    // Only create detection if we have a meaningful size
    const minSize = MIN_PIXELS;
    if (tempBounds.width < minSize || tempBounds.height < minSize) {
      this._isDragging = false;

      return true;
    }

    return true;
  }
}
