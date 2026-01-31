/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  DeleteAnnotationCommand,
  UpsertAnnotationCommand,
} from "@fiftyone/annotation";
import { CommandDispatcher } from "@fiftyone/command-bus";
import { Undoable } from "@fiftyone/commands";
import {
  InteractiveDetectionHandler,
  type LighterEventGroup,
  type Scene2D,
} from "@fiftyone/lighter";
import { AnnotationLabel } from "@fiftyone/state";
import { DETECTION, Field } from "@fiftyone/utilities";

/**
 * Command for creating a label with undo/redo support.
 */
export class CreateLabelCommand implements Undoable {
  readonly id: string;
  readonly description: string;
  private isRedo = false;

  constructor(
    private scene: Scene2D,
    private commandBus: Pick<CommandDispatcher, "execute">,
    private payload: LighterEventGroup["lighter:overlay-establish"],
    private labelData: AnnotationLabel["data"],
    private fieldSchema: Field,
    private type: string
  ) {
    this.id = `create-label-${payload.id}-${Date.now()}`;
    this.description = `Create label ${payload.id}`;
  }

  private resolveOverlay() {
    if (this.payload.overlay instanceof InteractiveDetectionHandler) {
      return this.payload.overlay.getOverlay();
    }
    return this.payload.overlay as any;
  }

  async execute(): Promise<void> {
    if (this.isRedo) {
      if (this.payload.overlay instanceof InteractiveDetectionHandler) {
        const handler = this.payload.overlay.getOverlay();

        const interactionManager = this.scene.getInteractionManager();

        if (this.payload.absoluteBounds) {
          handler.setAbsoluteBounds(this.payload.absoluteBounds);
        }
        if (this.payload.relativeBounds) {
          handler.setRelativeBounds(this.payload.relativeBounds);
        }
        interactionManager.removeHandler(this.payload.overlay);
        interactionManager.addHandler(handler);
      } else {
        const overlay = this.resolveOverlay();
        if (overlay) this.scene.addOverlay(overlay, false);
      }
    }
    this.isRedo = true;
    const overlay = this.resolveOverlay();
    const data = { ...this.labelData };
    if (this.type === DETECTION) {
      const { x, y, width, height } = this.scene.convertAbsoluteToRelative(
        this.payload.absoluteBounds
      );
      (data as any).bounding_box = [x, y, width, height];
    }

    await this.commandBus.execute(
      new UpsertAnnotationCommand(
        {
          data,
          path: overlay.field,
          overlay: overlay as any,
          type: this.type as any,
        },
        this.fieldSchema
      )
    );
  }

  async undo(): Promise<void> {
    if (this.payload.overlay instanceof InteractiveDetectionHandler) {
      const handler = this.payload.overlay.getOverlay();
      const interactionManager = this.scene.getInteractionManager();

      handler.unsetBounds();
      interactionManager.removeHandler(handler);
      interactionManager.addHandler(this.payload.overlay);
      this.scene.setCursor(this.payload.overlay.cursor);
    }
    const overlay = this.resolveOverlay();
    const data = { ...this.labelData };
    if (this.type === DETECTION) {
      const { x, y, width, height } = this.scene.convertAbsoluteToRelative(
        this.payload.absoluteBounds
      );
      (data as any).bounding_box = [x, y, width, height];
    }

    await this.commandBus.execute(
      new DeleteAnnotationCommand(
        {
          data,
          path: overlay.field,
          overlay: overlay as any,
          type: this.type as any,
        },
        this.fieldSchema
      )
    );
  }
}
