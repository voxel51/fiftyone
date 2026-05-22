import type { AnnotationLabel } from "@fiftyone/state";
import {
  CLASSIFICATION,
  DETECTION,
  KEYPOINT,
  POLYLINE,
} from "@fiftyone/utilities";
import { atom, type PrimitiveAtom } from "jotai";
import { atomWithReset } from "jotai/utils";

export type LabelType =
  | typeof CLASSIFICATION
  | typeof DETECTION
  | typeof POLYLINE
  | typeof KEYPOINT;

export const savedLabel = atom<AnnotationLabel["data"] | null>(
  null
) as PrimitiveAtom<AnnotationLabel["data"] | null>;

/**
 * Atom that tracks the current editing state for annotations.
 *
 * Three possible value shapes:
 *
 * 1. `null` — no label is being edited.
 *
 * 2. `PrimitiveAtom<AnnotationLabel>` — a label is being edited; the atom
 *    reference points to the label data being modified.
 *
 * 3. `LabelType` string — the user wants to create a new label of this type,
 *    but no schema fields exist for it. This triggers the "Add Schema" UI
 *    flow (see Field.tsx).
 *
 * Consumers should not read this atom directly — use {@link useAnnotationContext}
 * and its `selected.pendingNewType` / `selected.label` projections instead.
 */
export const editing = atomWithReset<
  PrimitiveAtom<AnnotationLabel> | LabelType | null
>(null);
