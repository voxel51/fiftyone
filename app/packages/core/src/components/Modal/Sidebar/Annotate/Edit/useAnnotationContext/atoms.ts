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
 * Whether the currently-edited label is mid-mask-authoring.
 *
 * Lighter dispatches `overlay-label-updated` with a `hasMask` flag during
 * AI mask painting / brush strokes before the label data commits. This
 * flag captures that transient state for the *current* label. It is:
 *
 * - reset to `false` on {@link clear}
 * - initialized from `data.mask | data.mask_path` on {@link select} so the
 *   flag is correct immediately when switching to a label whose mask
 *   already lives in committed data
 * - updated by the {@link AnnotationContext.setEditingMask} action, which
 *   ignores writes that don't match the current label's id
 */
export const currentEditingMaskAtom = atom<boolean>(false) as PrimitiveAtom<boolean>;

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

