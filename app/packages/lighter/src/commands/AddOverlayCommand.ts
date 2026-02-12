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
 */
export class AddOverlayCommand implements Undoable {
  readonly id: string;
  readonly description: string;

  constructor(
    private scene: Scene2D,
    private overlay: BaseOverlay | InteractiveDetectionHandler,
    private absoluteBounds?: Rect,
    private relativeBounds?: Rect
  ) {
    this.id = `add-overlay-${overlay.id}-${Date.now()}`;
    this.description = `Add overlay ${overlay.id}`;
  }

  execute(): void {
    if (this.overlay instanceof InteractiveDetectionHandler) {
      const handler = this.overlay.getOverlay();

      if (this.absoluteBounds) {
        handler.setAbsoluteBounds(this.absoluteBounds);
      }
      if (this.relativeBounds) {
        handler.setRelativeBounds(this.relativeBounds);
      }
      this.scene.addOverlay(handler, false);
    } else {
      this.scene.addOverlay(this.overlay, false);
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
  }
}
