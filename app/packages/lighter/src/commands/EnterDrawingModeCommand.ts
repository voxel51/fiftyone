/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Undoable } from "@fiftyone/commands";
import type { Scene2D } from "../core/Scene2D";

/**
 * Command that represents entering drawing/interactive mode.
 *
 * Pushed onto the undo stack when the user first starts drawing detections.
 * Undoing this command exits drawing mode and signals the annotation layer to
 * clean up editing state via the `lighter:drawing-session-ended` event.
 */
export class EnterDrawingModeCommand implements Undoable {
  readonly id: string;
  readonly description = "Enter drawing mode";

  constructor(private scene: Scene2D) {
    this.id = `enter-drawing-mode-${Date.now()}`;
  }

  execute(): void {
    this.scene.setDrawingSessionActive(true);
  }

  undo(): void {
    this.scene.endDrawingSession();
  }
}
