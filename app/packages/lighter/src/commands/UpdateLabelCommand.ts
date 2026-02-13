/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Undoable } from "@fiftyone/commands";
import type { BaseOverlay } from "../overlay/BaseOverlay";
import type { RawLookerLabel } from "../types";
import { EventDispatcher } from "@fiftyone/events";
import { AnnotationEventGroup } from "@fiftyone/annotation";

/**
 * Command for transforming an overlay with undo/redo support.
 */
export class UpdateLabelCommand implements Undoable {
  readonly id: string;
  readonly description: string;
  readonly nextLabel: RawLookerLabel;
  private hasExecuted = false;

  constructor(
    private overlay: BaseOverlay,
    private currentLabel: RawLookerLabel,
    nextLabel: RawLookerLabel,
    private readonly eventBus: EventDispatcher<AnnotationEventGroup>
  ) {
    this.id = `update-label-${overlay.id}-${Date.now()}`;
    this.description = `Update label ${overlay.id}`;
    this.nextLabel = nextLabel;
  }

  execute(): void {
    update(this.overlay, this.nextLabel);

    if (this.hasExecuted) {
      this.eventBus.dispatch("annotation:labelEdit", {
        label: this.nextLabel!,
      });
    } else {
      this.hasExecuted = true;
    }
  }

  undo(): void {
    update(this.overlay, this.currentLabel);

    this.eventBus.dispatch("annotation:undoLabelEdit", {
      label: this.currentLabel!,
    });
  }
}

const update = (overlay: BaseOverlay, label: RawLookerLabel) => {
  overlay.updateLabel?.(label);
};
