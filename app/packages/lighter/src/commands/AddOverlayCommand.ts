/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Scene2D } from "../core/Scene2D";
import { InteractiveDetectionHandler } from "../interaction/InteractiveDetectionHandler";
import type { BaseOverlay } from "../overlay/BaseOverlay";
import { Rect } from "../types";
import type { Command } from "./Command";

/**
 * Command for adding an overlay to the scene with undo/redo support.
 */
export class AddOverlayCommand implements Command {
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
      const interactionManager = this.scene.getInteractionManager();

      if (this.absoluteBounds) {
        handler.setAbsoluteBounds(this.absoluteBounds);
      }
      if (this.relativeBounds) {
        handler.setRelativeBounds(this.relativeBounds);
      }
      interactionManager.removeHandler(this.overlay);
      interactionManager.addHandler(handler);
    } else {
      this.scene.addOverlay(this.overlay, false);
    }
  }

  undo(): void {
    if (this.overlay instanceof InteractiveDetectionHandler) {
      const handler = this.overlay.getOverlay();
      const interactionManager = this.scene.getInteractionManager();

      handler.unsetBounds();
      interactionManager.removeHandler(handler);
      interactionManager.addHandler(this.overlay);
      this.scene.setCursor(this.overlay.cursor);
    } else {
      this.scene.removeOverlay(this.overlay.id, false);
    }
  }
}
