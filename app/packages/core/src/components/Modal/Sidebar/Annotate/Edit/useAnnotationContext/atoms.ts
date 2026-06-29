import type { AnnotationLabel } from "@fiftyone/state";
import { atom, type PrimitiveAtom } from "jotai";
import type { LabelType } from "./types";

export const savedLabel = atom<AnnotationLabel["data"] | null>(
  null,
) as PrimitiveAtom<AnnotationLabel["data"] | null>;

/**
 * Field path captured alongside {@link savedLabel} at select/create time.
 * Read in tandem with `savedLabel` by {@link hasChanges} so moving a label
 * to a new field counts as dirty even when the merged data is structurally
 * unchanged.
 */
export const savedLabelPath = atom<string | null>(null) as PrimitiveAtom<
  string | null
>;

export const currentEditingMaskAtom = atom<boolean>(
  false,
) as PrimitiveAtom<boolean>;

/**
 * Pointer to the label being edited. Mutually exclusive with
 * {@link pendingNewTypeAtom} — at most one is non-null at a time. Writes
 * must maintain this invariant; use the hook's `select`/`clear`/`createNew`
 * rather than touching this atom directly.
 */
export const editingLabelAtom = atom<PrimitiveAtom<AnnotationLabel> | null>(
  null,
) as PrimitiveAtom<PrimitiveAtom<AnnotationLabel> | null>;

/**
 * Label type for the "AddSchema" UI flow — set when the user tries to
 * create a label of a type that has no schema fields yet. Mutually
 * exclusive with {@link editingLabelAtom}.
 */
export const pendingNewTypeAtom = atom<LabelType | null>(
  null,
) as PrimitiveAtom<LabelType | null>;
