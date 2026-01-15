/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Command } from "@fiftyone/command-bus";
import { AnnotationLabel } from "@fiftyone/state";
import { Field } from "@fiftyone/utilities";

/**
 * Command to upsert (create or update) an annotation label.
 */
export class UpsertAnnotationCommand extends Command<boolean> {
  constructor(
    public readonly label: AnnotationLabel,
    public readonly schema: Field
  ) {
    super();
  }
}

/**
 * Command to delete an annotation label.
 */
export class DeleteAnnotationCommand extends Command<boolean> {
  constructor(
    public readonly label: AnnotationLabel,
    public readonly schema: Field
  ) {
    super();
  }
}
