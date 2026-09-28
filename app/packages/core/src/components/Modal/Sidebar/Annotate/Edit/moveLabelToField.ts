import type { AnnotationEngine, LabelRef } from "@fiftyone/annotation";
import type { LabelData } from "@fiftyone/utilities";
import type { LabelType } from "./useAnnotationContext";
import { buildNewLabelData } from "./useAnnotationContext/createNew";

export interface MovedLabel {
  data: { _id?: string; instance?: { _id?: string } };
  /** The sidebar's resolved type; label data may lack `_cls`. */
  type: LabelType;
}

/**
 * Atomic move between fields, ALL through the engine: drop EVERY occurrence of
 * the track from the source field and re-home it (with its per-frame geometry)
 * at the destination, in a single transaction (one coalesced change → one
 * autosave patch, one undo unit). A video track spans many frames — moving
 * only the current frame would leave the rest behind and never clear the
 * source — so the move fans across all frames the instance occupies. Identity
 * is the store's, so the track keeps its `instance._id` across the move. The
 * Lighter bridge's read-half re-homes the overlay off the engine change — the
 * sidebar never touches Lighter.
 *
 * Returns whether anything moved.
 */
export const moveLabelToField = (
  engine: Pick<
    AnnotationEngine,
    | "deleteLabel"
    | "enumerateLabels"
    | "getLabel"
    | "getLabelType"
    | "transaction"
    | "updateLabel"
  >,
  label: MovedLabel,
  from: string,
  to: string,
): boolean => {
  // Track identity is `instance._id` (shared across a video track's frames);
  // an image / sample-level label falls back to its doc `_id`. The store
  // addresses occurrences by this id, so a per-frame doc `_id` (which differs
  // frame to frame) would match nothing.
  const instanceId = label.data.instance?._id ?? label.data._id;

  if (!instanceId) return false;

  const type = engine.getLabelType(from);

  // Snapshot each occurrence BEFORE the transaction (the deletes mutate the
  // store). For an image / sample-level label this is one frame-less entry;
  // for a video track it is one entry per frame. Match by track identity +
  // field; each occurrence carries its own full ref (sample + frame) so writes
  // land in the right store and frame.
  const occurrences = engine
    .enumerateLabels([type])
    .filter((ref) => ref.path === from && ref.instanceId === instanceId)
    .map((ref) => ({ ref, data: engine.getLabel(ref) }))
    .filter((o): o is { ref: LabelRef; data: LabelData } => !!o.data);

  if (occurrences.length === 0) return false;

  engine.transaction(() => {
    for (const { ref } of occurrences) {
      engine.deleteLabel(ref);
    }

    for (const { ref, data } of occurrences) {
      engine.updateLabel(
        { sample: ref.sample, path: to, instanceId, frame: ref.frame },
        {
          ...buildNewLabelData(to, label.type, { id: instanceId }),
          ...data,
        } as Partial<LabelData>,
      );
    }
  });

  return true;
};
