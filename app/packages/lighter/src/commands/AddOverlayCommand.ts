/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Undoable } from "@fiftyone/commands";
import { getEventBus } from "@fiftyone/events";
import type { Scene2D } from "../core/Scene2D";
import type { LighterEventGroup } from "../events";
import type { InteractionHandler } from "../interaction/InteractionManager";
import type { BaseOverlay } from "../overlay/BaseOverlay";
import type { Rect, Spatial } from "../types";

/**
 * Type guard for interactive handlers that wrap an overlay (e.g. InteractiveDetectionHandler,
 * InteractiveKeypointHandler).
 */
function isInteractiveHandler(
  overlay: BaseOverlay | InteractionHandler,
): overlay is InteractionHandler & { getOverlay(): BaseOverlay } {
  return (
    "getOverlay" in overlay &&
    typeof (overlay as Record<string, unknown>).getOverlay === "function"
  );
}

/**
 * Type guard for overlays that expose a settable relativeBounds property.
 */
function hasRelativeBounds(
  obj: BaseOverlay,
): obj is BaseOverlay & { relativeBounds: Rect } {
  return "relativeBounds" in obj;
}

/**
 * Command for adding an overlay to the scene with undo/redo support.
 */
export class AddOverlayCommand implements Undoable {
  readonly id: string;
  readonly description: string;

  constructor(
    private scene: Scene2D,
    private overlay: BaseOverlay | InteractionHandler,
    private bounds?: Rect,
    private relativeBounds?: Rect,
  ) {
    this.id = `add-overlay-${overlay.id}-${Date.now()}`;
    this.description = `Add overlay ${overlay.id}`;
  }

  execute(): void {
    if (isInteractiveHandler(this.overlay)) {
      const handler = this.overlay.getOverlay();
      const interactionManager = this.scene.getInteractionManager();

      const spatial = handler as BaseOverlay & Partial<Spatial>;
      if (this.bounds && "bounds" in spatial) {
        spatial.bounds = this.bounds;
      }
      if (this.relativeBounds && hasRelativeBounds(handler)) {
        handler.relativeBounds = this.relativeBounds;
      }

      interactionManager.removeHandler(this.overlay as InteractionHandler);
      this.scene.addOverlay(handler, false);
    } else {
      this.scene.addOverlay(this.overlay as BaseOverlay, false);
    }
  }

  undo(): void {
    const overlayID = isInteractiveHandler(this.overlay)
      ? this.overlay.getOverlay().id
      : this.overlay.id;

    this.scene.exitInteractiveMode();

    // Dispatch before removeOverlay so the label is still in the labels list
    // when the bridge handles this event for backend persistence
    const eventBus = getEventBus<LighterEventGroup>(
      this.scene.getEventChannel(),
    );

    try {
      eventBus.dispatch("lighter:overlay-undone", { id: overlayID });
    } catch (error) {
      console.error(
        `Failed to dispatch overlay-undone for ${overlayID}:`,
        error,
      );
    } finally {
      if (isInteractiveHandler(this.overlay)) {
        const handler = this.overlay.getOverlay();
        const spatial = handler as BaseOverlay & Partial<Spatial>;
        if ("bounds" in spatial) {
          spatial.bounds = undefined;
        }
        this.scene.removeOverlay(handler.id, false);
      } else {
        this.scene.removeOverlay(this.overlay.id, false);
      }
    }
  }
}
