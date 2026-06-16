/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Command } from "@fiftyone/command-bus";
import { AnnotationLabel } from "@fiftyone/state";
import { Field } from "@fiftyone/utilities";

/**
 * Command to delete an annotation label.
 */
export class DeleteAnnotationCommand extends Command<boolean> {
  constructor(
    public readonly label: AnnotationLabel,
    public readonly schema: Field,
    /**
     * Optional gesture id: when this delete is one commit of a larger gesture
     * (e.g. a merge's source delete), the gesture passes its id so the delete
     * shares the gesture's single undo unit.
     */
    public readonly gestureId?: string
  ) {
    super();
  }
}
