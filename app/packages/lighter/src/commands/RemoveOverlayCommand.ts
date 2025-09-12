/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Scene2D } from "../core/Scene2D";
import type { BaseOverlay } from "../overlay/BaseOverlay";
import type { Command } from "./Command";

/**
 * Command for removing an overlay from the scene with undo/redo support.
 */
export class RemoveOverlayCommand implements Command {
  readonly id: string;
  readonly description: string;

  constructor(private scene: Scene2D, private overlay: BaseOverlay) {
    this.id = `remove-overlay-${overlay.id}-${Date.now()}`;
    this.description = `Remove overlay ${overlay.id}`;
  }

  execute(): void {
    this.scene.removeOverlay(this.overlay.id, false);
  }

  undo(): void {
    this.scene.addOverlay(this.overlay, false);
  }
}
