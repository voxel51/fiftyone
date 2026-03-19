/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { KeypointOverlay } from "../overlay/KeypointOverlay";
import type { Point } from "../types";
import type { InteractionHandler } from "./InteractionManager";

const INTERACTIVE_KEYPOINT_HANDLER_ID = "interactive-keypoint-handler";

/**
 * Interactive keypoint handler for creating keypoint annotations.
 *
 * Each click places a new point. Double-click or external signal to finish.
 * Mirrors InteractiveDetectionHandler's structure.
 */
export class InteractiveKeypointHandler implements InteractionHandler {
  readonly id = INTERACTIVE_KEYPOINT_HANDLER_ID;
  readonly cursor = "crosshair";

  constructor(public readonly overlay: KeypointOverlay) {}

  containsPoint(): boolean {
    // Capture all clicks while in creation mode
    return true;
  }

  getOverlay(): KeypointOverlay {
    return this.overlay;
  }

  resetOverlay(): void {
    this.overlay.clearPoints();
  }

  markDirty(): void {
    this.overlay.markDirty();
  }

  isMoving(): boolean {
    return false;
  }

  isDragging(): boolean {
    return false;
  }

  onPointerDown(
    _point: Point,
    worldPoint: Point,
    _event: PointerEvent
  ): boolean {
    this.overlay.addPoint(worldPoint);
    return true;
  }

  onMove(_point: Point, worldPoint: Point, _event: PointerEvent): boolean {
    this.overlay.setPreviewPoint(worldPoint);
    return true;
  }

  onPointerUp(_point: Point, _event: PointerEvent): boolean {
    // No-op — points are placed on pointer down, not release
    return true;
  }

  onDoubleClick(_point: Point, _event: PointerEvent): boolean {
    // Finish creation — caller listens for establish event
    return true;
  }

  cleanup(): void {
    this.overlay.setPreviewPoint(null);
  }
}
