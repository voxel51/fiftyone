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
    public readonly schema: Field
  ) {
    super();
  }
}

/**
 * Toggle the `keyframe` attribute on a set of video detections at a
 * specific playback time. Callers capture the time + selection at the
 * moment of user intent (keybinding handler, button click, …) and
 * pass them in — the command handler must not re-read "current time"
 * or "current selection", which would race the user's gesture and
 * land the toggle on a stale frame.
 *
 * `time` is in seconds. `detectionIds` are the synthetic overlay ids
 * (e.g. `track-N` or a MongoDB `_id`) the stream and Lighter agree on.
 *
 * Result is `true` when at least one cache entry was toggled, `false`
 * when there's no active video stream, no matching cache entry, or no
 * ids in the payload.
 */
export class MarkKeyframeCommand extends Command<boolean> {
  constructor(
    public readonly time: number,
    public readonly detectionIds: readonly string[]
  ) {
    super();
  }
}
