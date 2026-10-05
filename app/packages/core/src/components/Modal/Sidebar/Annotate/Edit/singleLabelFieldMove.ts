import type { LabelRef } from "@fiftyone/annotation";
import type { LabelData } from "@fiftyone/utilities";
import type { FrameSingletonSlot } from "./useAnnotationContext/types";

/** The slice of the engine a single-label move uses. */
interface SingleLabelMoveEngine {
  getLabel(ref: LabelRef): LabelData | undefined;
  updateLabel(ref: LabelRef, partial: Partial<LabelData>): void;
  deleteLabel(ref: LabelRef): void;
  transaction(fn: () => void): unknown;
}

/** `unhandled`: neither side is a frame field, so the caller moves it. */
export type SingleLabelMoveResult = "moved" | "refused" | "unhandled";

export interface SingleLabelMove {
  engine: SingleLabelMoveEngine;
  sample: string;
  from: string;
  to: string;
  /** The stored document id, kept across the move. */
  docId: string;
  slotOf: (path: string) => FrameSingletonSlot | undefined;
  isFrameField: (path: string) => boolean;
  /** A new label's defaults at `path`. */
  base: (path: string, id: string) => Partial<LabelData>;
}

/**
 * Move a Classification or Regression between fields when either side is a
 * video frame field. A frame field holds one value per frame, so only the
 * playhead frame's value moves, keeping its document id. A frame field without
 * one value per frame (a `Classifications` list) cannot take it.
 */
export const moveSingleLabel = ({
  engine,
  sample,
  from,
  to,
  docId,
  slotOf,
  isFrameField,
  base,
}: SingleLabelMove): SingleLabelMoveResult => {
  const fromSlot = slotOf(from);
  const toSlot = slotOf(to);

  if (!fromSlot && !toSlot) {
    return "unhandled";
  }

  if (isFrameField(to) && !toSlot) {
    return "refused";
  }

  const refAt = (path: string, slot?: FrameSingletonSlot): LabelRef =>
    slot
      ? { sample, path, instanceId: slot.instanceId, frame: slot.frame }
      : { sample, path, instanceId: docId };

  const fromRef = refAt(from, fromSlot);
  const toRef = refAt(to, toSlot);
  const data = engine.getLabel(fromRef);

  if (!data) {
    return "refused";
  }

  const { _docId: _stored, ...rest } = data;
  // a frame store keeps the document id aside; a sample store keys by it
  const value = toSlot ? { ...rest, _docId: docId } : { ...rest, _id: docId };

  engine.transaction(() => {
    engine.deleteLabel(fromRef);
    engine.updateLabel(toRef, { ...base(to, toRef.instanceId), ...value });
  });

  return "moved";
};
