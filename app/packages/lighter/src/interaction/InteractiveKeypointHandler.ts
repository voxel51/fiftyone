/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { EventDispatcher } from "@fiftyone/events";
import type { LighterEventGroup } from "../events";
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

  constructor(
    public readonly overlay: KeypointOverlay,
    private readonly eventBus: EventDispatcher<LighterEventGroup>,
    private readonly hitTest?: (relativePoint: Point) => boolean
  ) {}

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
    const rp = this.overlay.absolutePointToRelative(worldPoint);
    const onMask = this.hitTest?.({ x: rp[0], y: rp[1] }) ?? false;
    this.overlay.addPoint(worldPoint, onMask);
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
    // Finish creation by dispatching the same establish event used by
    // InteractiveDetectionHandler (via InteractionManager). This triggers
    // AddOverlayCommand to promote the overlay from interactive → scene.
    const bounds = this.overlay.bounds;
    this.eventBus.dispatch("lighter:overlay-establish", {
      id: this.overlay.id,
      handler: this,
      startBounds: bounds,
      startPosition: { x: bounds.x, y: bounds.y },
      bounds,
    });
    return true;
  }

  cleanup(): void {
    this.overlay.setPreviewPoint(null);
  }
}
