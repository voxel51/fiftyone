/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Undoable } from "@fiftyone/commands";
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
    private currentLabel: RawLookerLabel,
    nextLabel: RawLookerLabel
  ) {
    this.id = `update-label-${overlay.id}-${Date.now()}`;
    this.description = `Update label ${overlay.id}`;
    this.nextLabel = nextLabel;
  }

  async execute(): Promise<void> {
    update(this.overlay, this.nextLabel);
  }

  async undo(): Promise<void> {
    update(this.overlay, this.currentLabel);
  }
}

const update = (overlay: BaseOverlay, label: RawLookerLabel) => {
  overlay.updateLabel?.(label);
};
