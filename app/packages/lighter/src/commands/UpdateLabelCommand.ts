/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { BaseOverlay } from "../overlay/BaseOverlay";
import type { RawLookerLabel } from "../types";
import type { Command } from "./Command";

/**
 * Command for transforming an overlay with undo/redo support.
 */
export class UpdateLabelCommand implements Command {
  readonly id: string;
  readonly description: string;

  constructor(
    private overlay: BaseOverlay,
    private currentLabel: RawLookerLabel,
    private nextLabel: RawLookerLabel
  ) {
    this.id = `update-label-${overlay.id}-${Date.now()}`;
    this.description = `Update label ${overlay.id}`;
  }

  execute(): void {
    this.overlay.updateLabel(this.nextLabel);
  }

  undo(): void {
    this.overlay.updateLabel(this.currentLabel);
  }
}
