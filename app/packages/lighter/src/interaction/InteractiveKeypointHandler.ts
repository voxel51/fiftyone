/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { CommandContextManager } from "@fiftyone/commands";
import type { EventDispatcher } from "@fiftyone/events";
import { AddKeypointPointCommand } from "../commands/AddKeypointPointCommand";
import { RemoveKeypointPointCommand } from "../commands/RemoveKeypointPointCommand";
import type { LighterEventGroup } from "../events";
import { KeypointOverlay } from "../overlay/KeypointOverlay";
import type { Point } from "../types";
import type { InteractionHandler } from "./InteractionManager";
import { ClickEventModifiers, getClickModifiers } from "@fiftyone/utilities";

const INTERACTIVE_KEYPOINT_HANDLER_ID = "interactive-keypoint-handler";

/**
 * Action returned by a point-hit resolver.
 *
 * Callers returning `undefined` fall through to the default click behavior.
 */
export enum KeypointPointHitAction {
  DELETE = "delete",
}

/**
 * Context passed to a point-hit resolver when a click lands on an existing
 * point.
 */
export type KeypointPointHitContext = {
  pointId: string;
  relativePoint: Point;
  modifiers: ClickEventModifiers;
};

/**
 * Interactive keypoint handler for creating keypoint annotations.
 *
 * Each click places a new point. Double-click or external signal to finish.
 * Mirrors InteractiveDetectionHandler's structure.
 */
export class InteractiveKeypointHandler implements InteractionHandler {
  readonly id = INTERACTIVE_KEYPOINT_HANDLER_ID;
  readonly cursor = "crosshair";

  private readonly pushedCommandIds = new Set<string>();

  constructor(
    public readonly overlay: KeypointOverlay,
    private readonly eventBus: EventDispatcher<LighterEventGroup>,
    private readonly resolveVariant?: (
      relativePoint: Point,
      ctx: ClickEventModifiers
    ) => string | undefined,
    private readonly resolvePointHit?: (
      ctx: KeypointPointHitContext
    ) => KeypointPointHitAction | undefined
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
    event: PointerEvent
  ): boolean {
    const rp = this.overlay.absolutePointToRelative(worldPoint);
    const modifiers = getClickModifiers(event);

    // Click landed on an existing point;
    // check whether the resolver should override the default behavior.
    const hitId = this.overlay.findPointIdAt(worldPoint);
    if (hitId && this.resolvePointHit) {
      const action = this.resolvePointHit({
        pointId: hitId,
        relativePoint: { x: rp[0], y: rp[1] },
        modifiers,
      });

      if (action === KeypointPointHitAction.DELETE) {
        const command = new RemoveKeypointPointCommand(this.overlay, hitId);

        command.execute();

        CommandContextManager.instance()
          .getActiveContext()
          .pushUndoable(command);
        this.pushedCommandIds.add(command.id);

        return true;
      }
      // else fall through to default behavior
    }

    const variant = this.resolveVariant?.({ x: rp[0], y: rp[1] }, modifiers);
    const pointId = this.overlay.addPoint(worldPoint, variant);

    const command = new AddKeypointPointCommand(
      this.overlay,
      pointId,
      rp,
      variant
    );

    CommandContextManager.instance().getActiveContext().pushUndoable(command);
    this.pushedCommandIds.add(command.id);

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

  /**
   * Removes all undo/redo entries that this handler pushed during its
   * lifetime from the active command context.
   */
  pruneCommands(): void {
    if (this.pushedCommandIds.size === 0) {
      return;
    }

    CommandContextManager.instance()
      .getActiveContext()
      .pruneUndoables((u) => this.pushedCommandIds.has(u.id));

    this.pushedCommandIds.clear();
  }
}
