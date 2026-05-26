import { editingLabelAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useAnnotationContext/atoms";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { useSetRecoilState } from "recoil";
import {
  clearTransformStateSelector,
  selectedLabelForAnnotationAtom,
} from "../state";

/**
 * Clears 3D-specific selection and transform state whenever the annotation
 * editing pointer transitions to null.
 *
 * Why: the editing pointer lives in core's annotation context. Without this
 * hook, the cleanup of 3D-only recoil state has to live in `useExit`, which
 * couples core to looker-3d. Subscribing here lets `useExit` stay in the
 * editing-state layer while 3D state stays in 3D.
 */
export function useReset3dOnEditExit() {
  const editingLabel = useAtomValue(editingLabelAtom);
  const previousRef = useRef(editingLabel);
  const setSelectedLabel = useSetRecoilState(selectedLabelForAnnotationAtom);
  const clearTransformState = useSetRecoilState(clearTransformStateSelector);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = editingLabel;

    if (previous !== null && editingLabel === null) {
      setSelectedLabel(null);
      clearTransformState(null);
    }
  }, [editingLabel, setSelectedLabel, clearTransformState]);
}
