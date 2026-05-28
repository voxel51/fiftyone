/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { CommandContextManager } from "@fiftyone/commands";
import { AddMaskKeypointCommand } from "../commands/AddMaskKeypointCommand";
import type { DetectionOverlay } from "../overlay/DetectionOverlay";
import type { Point } from "../types";
import type { InteractionHandler, OverlayEvent } from "./InteractionManager";

const INTERACTIVE_PEN_HANDLER_ID = "interactive-pen-handler";

// PointerEvent.buttons & 1 == left button held down.
const LEFT_MOUSE_BUTTON = 1;

/**
 * Editing handler for the pen tool on a {@link DetectionOverlay}'s mask.
 *
 * Mirrors {@link InteractivePolylineHandler}: while installed via
 * `scene.enterInteractiveMode`, captures every click and routes it as a
 * single pen keypoint placement. Each placement pushes an
 * {@link AddMaskKeypointCommand} so users can undo points individually.
 *
 * Commit to the mask (right-click) is handled separately in
 * {@link InteractionManager.handleRightClick} via `overlay.commitPenPolygon`;
 * on commit the per-point commands are pruned and replaced by the single
 * `PaintStrokeCommand` that represents the filled polygon.
 */
export class InteractivePenHandler implements InteractionHandler {
  readonly id = INTERACTIVE_PEN_HANDLER_ID;
  readonly cursor = "crosshair";

  private readonly pushedCommandIds = new Set<string>();

  constructor(public readonly overlay: DetectionOverlay) {}

  containsPoint(): boolean {
    // Capture all clicks while active.
    return true;
  }

  getOverlay(): DetectionOverlay {
    return this.overlay;
  }

  markDirty(): void {
    this.overlay.markDirty();
  }

  onPointerDown({ worldPoint }: OverlayEvent): boolean {
    this.placePoint(worldPoint, false);
    return true;
  }

  onMove({ worldPoint, event }: OverlayEvent): boolean {
    if ((event.buttons & LEFT_MOUSE_BUTTON) === LEFT_MOUSE_BUTTON) {
      this.placePoint(worldPoint, true);
    } else {
      this.overlay.updatePenMousePosition(worldPoint);
    }
    return true;
  }

  onPointerUp(): boolean {
    return true;
  }

  onCanvasLeave(): void {
    this.overlay.updatePenMousePosition(null);
  }

  cleanup(): void {
    this.overlay.updatePenMousePosition(null);
  }

  /**
   * Removes every per-point undo entry pushed by this handler. Called after
   * `commitPenPolygon` so the resulting `PaintStrokeCommand` becomes the
   * single undoable artifact for the whole polygon.
   */
  pruneCommands(): void {
    if (this.pushedCommandIds.size === 0) return;

    CommandContextManager.instance()
      .getActiveContext()
      .pruneUndoables((u) => this.pushedCommandIds.has(u.id));

    this.pushedCommandIds.clear();
  }

  private placePoint(worldPoint: Point, dragging: boolean): void {
    const pointId = this.overlay.addMaskKeypoint(worldPoint, { dragging });
    if (pointId === null) return;

    const cmd = new AddMaskKeypointCommand(this.overlay, pointId, {
      x: worldPoint.x,
      y: worldPoint.y,
    });
    CommandContextManager.instance().getActiveContext().pushUndoable(cmd);
    this.pushedCommandIds.add(cmd.id);
  }
}
