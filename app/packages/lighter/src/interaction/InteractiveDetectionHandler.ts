/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { DetectionOverlay } from "../overlay/DetectionOverlay";
import type { Point } from "../types";
import type { InteractionHandler, OverlayEvent } from "./InteractionManager";

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

  constructor(public readonly overlay: DetectionOverlay) {}

  containsPoint(): boolean {
    return true;
  }

  getOverlay(): DetectionOverlay {
    return this.overlay;
  }

  resetOverlay(): void {
    this.overlay.bounds = undefined;
  }

  markDirty(): void {
    this.overlay.markDirty();
  }

  onPointerDown({ point }: OverlayEvent): boolean {
    this.startPoint = point;
    this._isDragging = true;
    this.overlay.toggleSelected();
    this.overlay.bounds = {
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
    };

    return true;
  }

  isMoving(): boolean {
    return this._isDragging;
  }

  isDragging(): boolean {
    return this._isDragging;
  }

  private updateBounds(point: Point): boolean {
    if (!this._isDragging || !this.startPoint) return false;

    const x = Math.min(this.startPoint.x, point.x);
    const y = Math.min(this.startPoint.y, point.y);
    const width = Math.abs(point.x - this.startPoint.x);
    const height = Math.abs(point.y - this.startPoint.y);

    this.overlay.bounds = { x, y, width, height };
    return true;
  }

  onMove({ point }: OverlayEvent): boolean {
    return this.updateBounds(point);
  }

  onDrag(point: Point, _event: PointerEvent): boolean {
    return this.updateBounds(point);
  }

  onPointerUp(_params: OverlayEvent): boolean {
    if (!this._isDragging || !this.startPoint) {
      this._isDragging = false;
      return false;
    }

    const tempBounds = this.overlay.bounds;

    // Only create detection if we have a meaningful size
    const minSize = MIN_PIXELS;
    if (tempBounds.width < minSize || tempBounds.height < minSize) {
      this._isDragging = false;

      return true;
    }

    return true;
  }
}
