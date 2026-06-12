/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Undoable } from "@fiftyone/commands";
import type { EventDispatcher } from "@fiftyone/events";
import type { LabelData, Sample } from "@fiftyone/utilities";
import type { AnnotationEventGroup } from "../events";

/**
 * Undoable command that applies a sidebar label-attribute edit to the shared
 * {@link Sample} (the single source of truth), rather than mutating the Lighter
 * overlay directly.
 *
 * This is the inversion of the legacy `UpdateLabelCommand` (which wrote the
 * overlay and let the overlay→Sample mirror catch up): here the command writes
 * Sample and the engine's bridge loop reconciles the overlay as a
 * consequence (silent `applyLabel`, no echo). Sidebar display stays in sync
 * via the existing `lighter:command-executed → save(nextLabel)` bridge, which
 * reads {@link nextLabel}.
 *
 * It stays on Lighter's command stack (executed via `scene.executeCommand`) so
 * undo/redo keep working; `execute`/`undo` re-apply the next/previous label to
 * Sample and emit `annotation:labelEdit` / `annotation:undoLabelEdit` for the
 * sidebar label store.
 */
export class UpdateSampleLabelCommand implements Undoable {
  readonly id: string;
  readonly description: string;
  /**
   * The next (full) label, exposed for the `lighter:command-executed` →
   * sidebar-sync bridge in `useBridge`.
   */
  readonly nextLabel: LabelData;
  private hasExecuted = false;

  constructor(
    private readonly sample: Sample,
    private readonly path: string,
    private readonly labelId: string,
    nextLabel: Partial<LabelData>,
    private readonly currentLabel: Partial<LabelData>,
    private readonly eventBus: EventDispatcher<AnnotationEventGroup>
  ) {
    this.id = `update-sample-label-${labelId}-${Date.now()}`;
    this.description = `Update label ${labelId}`;
    this.nextLabel = { ...nextLabel, _id: labelId } as LabelData;
  }

  execute(): void {
    this.sample.updateLabel(this.path, this.nextLabel);

    // First execute is the user's edit; the sidebar already holds the value.
    // Re-executes (redo) re-sync the sidebar label store via the bus.
    if (this.hasExecuted) {
      this.eventBus.dispatch("annotation:labelEdit", { label: this.nextLabel });
    } else {
      this.hasExecuted = true;
    }
  }

  undo(): void {
    this.sample.updateLabel(this.path, {
      ...this.currentLabel,
      _id: this.labelId,
    } as LabelData);

    this.eventBus.dispatch("annotation:undoLabelEdit", {
      label: this.currentLabel,
    });
  }
}
