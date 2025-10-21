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
    private overlay: InteractiveDetectionHandler,
    private absoluteBounds: Rect,
    private relativeBounds: Rect
  ) {
    this.id = `add-overlay-${overlay.id}-${Date.now()}`;
    this.description = `Add overlay ${overlay.id}`;
    console.log("[AddOverlayCommand][create]", this.overlay);
  }

  execute(): void {
    // console.log("[AddOverlayCommand][execute]", this.overlay);
    // //this.overlay.setBounds(this.endBounds);
    // this.scene.enterInteractiveMode(this.overlay);

    console.log("[EstablishOverlayCommand][execute]", this.overlay);
    const handler = this.overlay.getOverlay();
    const interactionManager = this.scene.getInteractionManager();

    handler.setAbsoluteBounds(this.absoluteBounds);
    handler.setRelativeBounds(this.relativeBounds);
    interactionManager.removeHandler(this.overlay);
    interactionManager.addHandler(handler);
  }

  undo(): void {
    const handler = this.overlay.getOverlay();
    const interactionManager = this.scene.getInteractionManager();

    handler.unsetBounds();
    interactionManager.removeHandler(handler);
    interactionManager.addHandler(this.overlay);
    this.scene.setCursor(this.overlay.cursor);

    // if (this.overlay instanceof InteractiveDetectionHandler) {
    //   console.log("[AddOverlayCommand][undo]", this.overlay);
    //   this.overlay.resetOverlay();
    //   this.scene.setCursor(this.overlay.cursor);
    //   //this.scene.exitInteractiveMode();
    // } else {
    //   console.log("]AddOverlayCommand[]undo[", this.overlay);
    //   this.scene.removeOverlay(this.overlay.id, false);
    // }
  }
}
