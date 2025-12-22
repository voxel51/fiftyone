/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Undoable } from "@fiftyone/commands";
import type { Scene2D } from "../core/Scene2D";
import type { BaseOverlay } from "../overlay/BaseOverlay";

/**
 * Command for removing an overlay from the scene with undo/redo support.
 */
export class RemoveOverlayCommand implements Undoable {
  readonly id: string;
  readonly description: string;

  constructor(private scene: Scene2D, private overlay: BaseOverlay) {
    this.id = `remove-overlay-${overlay.id}-${Date.now()}`;
    this.description = `Remove overlay ${overlay.id}`;
  }

  async execute(): Promise<void> {
    this.scene.removeOverlay(this.overlay.id, false);
  }

  async undo(): Promise<void> {
    this.scene.addOverlay(this.overlay, false);
  }
}
