/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Command } from "@fiftyone/command-bus";
import type { TemporalLabel } from "@fiftyone/lighter";
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

/**
 * Edit one or more fields on a `TemporalDetection`. Handler resolves
 * the field/id pair to the corresponding scene `TemporalOverlay` and
 * merges `update` into `overlay.label`; persistence picks the change
 * up by walking scene overlays at autosave time.
 */
export class EditTemporalDetectionCommand extends Command<boolean> {
  constructor(
    public readonly fieldPath: string,
    public readonly detectionId: string,
    public readonly update: Partial<TemporalLabel>
  ) {
    super();
  }
}

/**
 * Delete a `TemporalDetection`. The handler resolves the `field`/`id` pair
 * to its scene `TemporalOverlay` and removes it. Unlike an object track this
 * is sample-level — there's no per-frame work; removing the overlay drops the
 * timeline row and, at autosave, `useTemporalDetectionDeltaSupplier` emits the
 * matching `remove` JSON-Patch op. Resolves `true` when an overlay was removed.
 */
export class DeleteTemporalDetectionCommand extends Command<boolean> {
  constructor(
    public readonly fieldPath: string,
    public readonly detectionId: string
  ) {
    super();
  }
}

/**
 * Create a new `TemporalDetection`. Handler mints a client-side `_id`,
 * instantiates a `TemporalOverlay`, adds it to the scene, and resolves
 * to the id. The autosave delta walk emits an `add /-` for any overlay
 * not yet on the sample.
 */
export class CreateTemporalDetectionCommand extends Command<string | null> {
  constructor(
    public readonly fieldPath: string,
    public readonly support: readonly [number, number],
    public readonly label?: string
  ) {
    super();
  }
}

/**
 * Extend a tracked object's presence by copying a source frame's box onto
 * the frames a timeline drag grew the bar over. Fired on drag-out of an
 * object track bar's edge. `trackId` is the synthetic overlay id
 * (`instance-…` / `track-…`) the stream and timeline agree on;
 * `sourceFrame` is the existing endpoint whose box is copied; the copies
 * land on `targetFrames` as non-keyframe filler (so a later Propagate can
 * overwrite them in place). Resolves `true` when at least one frame was
 * written.
 */
export class ExtendTrackCommand extends Command<boolean> {
  constructor(
    public readonly trackId: string,
    public readonly sourceFrame: number,
    public readonly targetFrames: readonly number[]
  ) {
    super();
  }
}

/**
 * Delete every detection belonging to a tracked object across the clip.
 * `trackId` is the synthetic overlay id (`instance-…` / `track-…`) the
 * stream and timeline agree on. Resolves `true` when at least one
 * detection was removed.
 */
export class DeleteTrackCommand extends Command<boolean> {
  constructor(public readonly trackId: string) {
    super();
  }
}

/**
 * Trim a tracked object's presence by deleting its detection on each of
 * `frames` — the frames a timeline drag pulled the bar edge past. Fired on
 * drag-in of an object track bar's edge. Resolves `true` when at least one
 * detection was removed.
 */
export class TrimTrackCommand extends Command<boolean> {
  constructor(
    public readonly trackId: string,
    public readonly frames: readonly number[]
  ) {
    super();
  }
}

/**
 * Rigidly shift a tracked object's detections by `delta` frames over the
 * dragged segment `frames` — e.g. to correct labels that are off by a
 * frame. Fired on drag of an object track bar's body. Boxes, keyframe
 * flags, and propagation provenance travel with each label; frames vacated
 * at the trailing edge are cleared. Resolves `true` when the shift was
 * applied.
 */
export class ShiftTrackCommand extends Command<boolean> {
  constructor(
    public readonly trackId: string,
    public readonly frames: readonly number[],
    public readonly delta: number
  ) {
    super();
  }
}

/**
 * Apply track-level attribute edits to every frame of a tracked object.
 * `trackId` is the synthetic overlay id (`instance-…` / `track-…`) the stream
 * and timeline agree on. Resolves `true` when at least one frame's detection
 * was updated.
 */
export class UpdateTrackAttributesCommand extends Command<boolean> {
  constructor(
    public readonly trackId: string,
    public readonly attributes: Record<string, unknown>
  ) {
    super();
  }
}

/**
 * Propagate a tracked object's bounding box between two bracketing
 * keyframes via the registered propagation agent selected by `method`
 * (`"linear"` → `propagate-linear` lerp; `"sam2"` → `propagate-sam2`
 * per-frame SAM2 tracking, which streams results as inference lands).
 * Resolves to `true` when at least one in-between frame was written,
 * `false` when prerequisites are missing (no stream, no bracketing
 * keyframes, no registered agent / frame source for the method).
 */
export class PropagateCommand extends Command<boolean> {
  constructor(
    public readonly instanceId: string,
    public readonly fromFrame: number,
    public readonly toFrame: number,
    public readonly method: string
  ) {
    super();
  }
}
