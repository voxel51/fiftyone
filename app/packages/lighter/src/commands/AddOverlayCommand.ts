/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { getEventBus } from "@fiftyone/events";
import { Scene2D } from "../core/Scene2D";
import type { LighterEventGroup } from "../events";
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
      const interactionManager = this.scene.getInteractionManager();

      if (this.absoluteBounds) {
        handler.setAbsoluteBounds(this.absoluteBounds);
      }
      if (this.relativeBounds) {
        handler.setRelativeBounds(this.relativeBounds);
      }

      interactionManager.removeHandler(this.overlay);
      this.scene.addOverlay(handler, false);
    } else {
      this.scene.addOverlay(this.overlay, false);
    }
  }

  undo(): void {
    const overlayID =
      this.overlay instanceof InteractiveDetectionHandler
        ? this.overlay.getOverlay().id
        : this.overlay.id;

    // Dispatch before removeOverlay so the label is still in the labels list
    // when the bridge handles this event for backend persistence
    const eventBus = getEventBus<LighterEventGroup>(
      this.scene.getEventChannel()
    );

    try {
      eventBus.dispatch("lighter:overlay-undone", { id: overlayID });
    } catch (error) {
      console.error(
        `Failed to dispatch overlay-undone for ${overlayID}:`,
        error
      );
    } finally {
      if (this.overlay instanceof InteractiveDetectionHandler) {
        const handler = this.overlay.getOverlay();

        handler.unsetBounds();
        this.scene.removeOverlay(handler.id, false);
      } else {
        this.scene.removeOverlay(this.overlay.id, false);
      }
    }
  }
}
