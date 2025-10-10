/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Scene2D } from "../core/Scene2D";
import type { BaseOverlay } from "../overlay/BaseOverlay";
import type { Command } from "./Command";

/**
 * Command for adding an overlay to the scene with undo/redo support.
 */
export class AddOverlayCommand implements Command {
  readonly id: string;
  readonly description: string;

  constructor(private scene: Scene2D, private overlay: BaseOverlay) {
    this.id = `add-overlay-${overlay.id}-${Date.now()}`;
    this.description = `Add overlay ${overlay.id}`;
  }

  execute(): void {
    this.scene.addOverlay(this.overlay, false);
  }

  undo(): void {
    this.scene.removeOverlay(this.overlay.id, false);
  }
}
