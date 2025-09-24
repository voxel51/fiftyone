import type { AnnotationLabel } from "@fiftyone/state";
import type { PrimitiveAtom } from "jotai";
import { atom } from "jotai";

export const editing = atom<PrimitiveAtom<AnnotationLabel> | null>(null);

export const current = atom((get) => {
  const currentEditing = get(editing);

  if (currentEditing) {
    return get(currentEditing);
  }

  return null;
});

export const isEditing = atom((get) => get(editing) !== null);

export const interactiveModeInput = atom<{
  inputType: "new-bounding-box";
  payload: {
    x: number;
    y: number;
  };
  onComplete: (value: any) => void;
  onDismiss?: () => void;
} | null>(null);
