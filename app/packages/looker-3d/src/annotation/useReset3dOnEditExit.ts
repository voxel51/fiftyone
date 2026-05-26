import { useAnnotationContext } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useAnnotationContext";
import { useEffect, useRef } from "react";
import { useSetRecoilState } from "recoil";
import {
  clearTransformStateSelector,
  selectedLabelForAnnotationAtom,
} from "../state";

/**
 * Resets 3D-specific selection/transform state when editing exits. Lives in
 * looker-3d so core's useExit doesn't reach across packages.
 */
export function useReset3dOnEditExit() {
  const { selected } = useAnnotationContext();
  const editingLabel = selected.label;
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
