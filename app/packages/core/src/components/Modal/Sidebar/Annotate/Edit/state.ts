import type { AnnotationLabel } from "@fiftyone/state";
import type { PrimitiveAtom } from "jotai";
import { atom } from "jotai";

export const editing = atom<PrimitiveAtom<AnnotationLabel> | null>(null);

export const current = atom((get) => {
  const current = get(editing);
  if (current) {
    return get(current);
  }

  throw new Error("no data");
});
export const isEditing = atom((get) => get(editing) !== null);
