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

  private lastClickTime = 0;
  private static readonly DOUBLE_CLICK_MS = 300;

  constructor(
    public readonly overlay: KeypointOverlay,
    private readonly eventBus: EventDispatcher<LighterEventGroup>
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
    // Block placement while inference is processing (ripple active)
    if (
      "isProcessing" in this.overlay &&
      (this.overlay as any).isProcessing()
    ) {
      return true; // swallow the click
    }

    // Only place points within the sample image bounds
    if (!this.isWithinSample(worldPoint)) {
      return false;
    }

    // Snap-to-close: if clicking near the first point with ≥3 points, close the polygon
    if (this.overlay.isNearFirstPoint(worldPoint)) {
      this.closeAndEstablish();
      return true;
    }

    // Double-click detection (same pattern as 3D polyline SegmentPolylineRenderer):
    // On the second quick click, remove the point added by the first click
    // and close/establish the shape.
    const now = Date.now();
    const isDoubleClick =
      now - this.lastClickTime < InteractiveKeypointHandler.DOUBLE_CLICK_MS;
    this.lastClickTime = now;

    if (isDoubleClick) {
      const points = this.overlay.getRelativePoints();
      if (points.length > 0) {
        this.overlay.removePoint(points.length - 1);
      }
      this.closeAndEstablish();
      return true;
    }

    this.overlay.addPoint(worldPoint);
    return true;
  }

  /**
   * Checks whether a world-space point falls within the [0,1] normalized
   * sample bounds (i.e. inside the image).
   */
  private isWithinSample(worldPoint: Point): boolean {
    const cs = this.overlay.getCoordinateSystemPublic?.();
    if (!cs) return true; // no coordinate system — allow placement

    const t = cs.getTransform();
    const rx = (worldPoint.x - t.offsetX) / t.scaleX;
    const ry = (worldPoint.y - t.offsetY) / t.scaleY;

    return rx >= 0 && rx <= 1 && ry >= 0 && ry <= 1;
  }

  onMove(_point: Point, worldPoint: Point, _event: PointerEvent): boolean {
    this.overlay.setPreviewPoint(worldPoint);

    // Highlight first point when cursor is near it (snap-to-close feedback)
    this.overlay.setFirstPointHighlighted(
      this.overlay.isNearFirstPoint(worldPoint)
    );

    return true;
  }

  onPointerUp(_point: Point, _event: PointerEvent): boolean {
    // No-op — points are placed on pointer down, not release
    return true;
  }

  onDoubleClick(_point: Point, _event: PointerEvent): boolean {
    this.closeAndEstablish();
    return true;
  }

  /**
   * Closes the polygon and dispatches the establish event.
   * Used by both snap-to-close (click on first point) and double-click.
   */
  private closeAndEstablish(): void {
    const points = this.overlay.getRelativePoints();
    if (points.length >= 3) {
      this.overlay.setClosed(true);
    }

    this.overlay.setPreviewPoint(null);
    this.overlay.setFirstPointHighlighted(false);

    const bounds = this.overlay.bounds;
    this.eventBus.dispatch("lighter:overlay-establish", {
      id: this.overlay.id,
      handler: this,
      startBounds: bounds,
      startPosition: { x: bounds.x, y: bounds.y },
      bounds,
    });
  }

  cleanup(): void {
    this.overlay.setPreviewPoint(null);
  }
}
