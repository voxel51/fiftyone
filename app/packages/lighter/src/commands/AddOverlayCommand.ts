/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Scene2D } from "../core/Scene2D";
import { InteractiveDetectionHandler } from "../interaction/InteractiveDetectionHandler";
import type { BaseOverlay } from "../overlay/BaseOverlay";
import { Rect } from "../types";
import type { Undoable } from "@fiftyone/commands";

/**
 * Command for adding an overlay to the scene with undo/redo support.
 *
 * When {@link startsSession} is true this command also manages the drawing
 * session lifecycle: undoing it ends the drawing session, and redoing it
 * re-activates it.  This replaces the former standalone
 * `EnterDrawingModeCommand`.
 */
export class AddOverlayCommand implements Undoable {
  readonly id: string;
  readonly description: string;

  constructor(
    private scene: Scene2D,
    private overlay: BaseOverlay | InteractiveDetectionHandler,
    private absoluteBounds?: Rect,
    private startsSession: boolean = false
  ) {
    this.id = `add-overlay-${overlay.id}-${Date.now()}`;
    this.description = `Add overlay ${overlay.id}`;
  }

  execute(): void {
    if (this.startsSession) {
      this.scene.setDrawingSessionActive(true);
    }

    if (this.overlay instanceof InteractiveDetectionHandler) {
      const handler = this.overlay.getOverlay();

      // Restore absolute bounds first — these are always accurate because
      // they are set synchronously during pointer events.
      if (this.absoluteBounds) {
        handler.setAbsoluteBounds(this.absoluteBounds);
      }

      // Add to scene (injects renderer, registers with managers).
      this.scene.addOverlay(handler, false);

      // Compute authoritative relative bounds from absolute bounds via the
      // scene's coordinate system.  The `relativeBounds` captured at
      // establish-time can be stale because the render-loop's absolute→
      // relative conversion may not have run before the establish event
      // fired.
      if (this.absoluteBounds) {
        const rel = this.scene.toRelativeBounds(this.absoluteBounds);
        if (rel) {
          handler.setRelativeBounds(rel);

          // Sync the label's bounding_box so the sidebar and persistence
          // layer see the correct values.
          handler.label = {
            ...handler.label,
            bounding_box: [rel.x, rel.y, rel.width, rel.height],
          };
        }
      }

      this.scene.dispatchOverlayRestored(handler);
    } else {
      this.scene.addOverlay(this.overlay, false);
      this.scene.dispatchOverlayRestored(this.overlay);
    }
  }

  undo(): void {
    if (this.overlay instanceof InteractiveDetectionHandler) {
      const handler = this.overlay.getOverlay();

      this.scene.removeOverlay(handler.id, false);

      if (this.scene.getInteractiveMode()) {
        this.scene.exitInteractiveMode();
      }
    } else {
      this.scene.removeOverlay(this.overlay.id, false);
    }

    if (this.startsSession) {
      this.scene.endDrawingSession();
    }
  }
}
