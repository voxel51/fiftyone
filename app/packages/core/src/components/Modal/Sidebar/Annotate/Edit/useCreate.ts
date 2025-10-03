import type { AnnotationLabel } from "@fiftyone/state";
import type { CLASSIFICATION, DETECTION } from "@fiftyone/utilities";
import { objectId } from "@fiftyone/utilities";
import { atom, useSetAtom } from "jotai";
import { useCallback } from "react";
import { editing } from "./state";

const createLabel = () => ({ id: objectId(), tags: [] as string[] });

export default function useCreate(
  type: typeof CLASSIFICATION | typeof DETECTION
) {
  const setEditing = useSetAtom(editing);

  return useCallback(() => {
    setEditing(atom<AnnotationLabel>({ type, data: createLabel() }));
  }, [setEditing, type]);
}
