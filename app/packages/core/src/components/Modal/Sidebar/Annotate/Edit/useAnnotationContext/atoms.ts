import type { AnnotationLabel } from "@fiftyone/state";
import {
  CLASSIFICATION,
  DETECTION,
  KEYPOINT,
  POLYLINE,
} from "@fiftyone/utilities";
import { atom, type PrimitiveAtom } from "jotai";

export type LabelType =
  | typeof CLASSIFICATION
  | typeof DETECTION
  | typeof POLYLINE
  | typeof KEYPOINT;

export const savedLabel = atom<AnnotationLabel["data"] | null>(
  null
) as PrimitiveAtom<AnnotationLabel["data"] | null>;

/**
 * Atom holding a pointer to the label being edited.
 *
 * `null` means no label is being edited. When non-null, the inner
 * `PrimitiveAtom<AnnotationLabel>` is the live store entry for the label's
 * data — writes to it propagate to the labels list and any subscribed
 * components.
 *
 * Mutually exclusive with {@link pendingNewTypeAtom}: at most one is non-null
 * at any time. The {@link editing} back-compat atom enforces this invariant
 * when written through.
 */
export const editingLabelAtom = atom<PrimitiveAtom<AnnotationLabel> | null>(
  null
) as PrimitiveAtom<PrimitiveAtom<AnnotationLabel> | null>;

/**
 * Atom holding the label type the user is trying to create when no schema
 * fields exist for it yet — triggers the "Add Schema" UI flow.
 *
 * Mutually exclusive with {@link editingLabelAtom}.
 */
export const pendingNewTypeAtom = atom<LabelType | null>(
  null
) as PrimitiveAtom<LabelType | null>;

