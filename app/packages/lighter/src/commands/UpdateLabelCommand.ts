/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Undoable } from "@fiftyone/commands";
import type { EventDispatcher } from "@fiftyone/events";
import type { LighterEventGroup } from "../events";
import type { BaseOverlay } from "../overlay/BaseOverlay";
import type { RawLookerLabel } from "../types";

/**
 * Command for transforming an overlay with undo/redo support.
 */
export class UpdateLabelCommand implements Undoable {
  readonly id: string;
  readonly description: string;

  readonly nextLabel: RawLookerLabel;

  constructor(
    private overlay: BaseOverlay,
    private eventBus: EventDispatcher<LighterEventGroup>,
    private currentLabel: RawLookerLabel,
    nextLabel: RawLookerLabel,
    private origin?: string
  ) {
    this.id = `update-label-${overlay.id}-${Date.now()}`;
    this.description = `Update label ${overlay.id}`;
    this.nextLabel = nextLabel;
  }

  execute(): void {
    update(this.overlay, this.eventBus, this.nextLabel, this.origin);
  }

  undo(): void {
    update(this.overlay, this.eventBus, this.currentLabel);
  }
}

const update = (
  overlay: BaseOverlay,
  eventBus: EventDispatcher<LighterEventGroup>,
  label: RawLookerLabel,
  origin?: string
) => {
  overlay.updateLabel?.(label);
  eventBus.dispatch("lighter:label-updated", { label, origin });
};
