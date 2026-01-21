import { useLighter } from "@fiftyone/lighter";
import { TypeGuards } from "@fiftyone/lighter/src/core/Scene2D";
import {
  selectedLabelForAnnotationAtom,
  stagedCuboidTransformsAtom,
  stagedPolylineTransformsAtom,
} from "@fiftyone/looker-3d/src/state";
import { getDefaultStore, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { editing } from ".";
import { AnnotationLabel } from "@fiftyone/state";
import { current, currentOverlay, savedLabel } from "./state";
import { CommandContextManager } from "@fiftyone/commands";

export default function useExit(revertLabel = true) {
  const setEditing = useSetAtom(editing);
  const setSaved = useSetAtom(savedLabel);
  const { scene, removeOverlay } = useLighter();

  /**
   * 3D SPECIFIC IMPORTS
   * : TODO: CLEAN THIS UP. THIS FUNCTION SHOULDN'T BE
   * COUPLED TO LIGHTER OR LOOKER-3D.
   */

  const setStagedPolylineTransforms = useSetRecoilState(
    stagedPolylineTransformsAtom
  );
  const setStagedCuboidTransforms = useSetRecoilState(
    stagedCuboidTransformsAtom
  );
  const setSelectedLabelForAnnotation = useSetRecoilState(
    selectedLabelForAnnotationAtom
  );
  /**
   * 3D SPECIFIC IMPORTS ENDS HERE.
   */

  return useCallback(() => {
    const store = getDefaultStore();
    const overlay = store.get(currentOverlay);

    if (overlay) {
      scene?.deselectOverlay(overlay.id, { ignoreSideEffects: true });
      if (TypeGuards.isHoverable(overlay)) {
        overlay.onHoverLeave?.();
      }
    }

    const label = store.get(savedLabel);
    const unsaved = store.get(current);

    /**
     * 3D SPECIFIC LOGIC
     * : TODO: CLEAN THIS UP. THIS FUNCTION SHOULDN'T BE
     * COUPLED TO LIGHTER OR LOOKER-3D.
     */
    setStagedPolylineTransforms({});
    setStagedCuboidTransforms({});
    setSelectedLabelForAnnotation(null);
    /**
     * 3D SPECIFIC LOGIC ENDS HERE.
     */

    if (!label || !revertLabel) {
      setSaved(null);
      setEditing(null);
      return;
    }

    // label has not been persisted, so remove it
    if (unsaved?.isNew) {
      removeOverlay(unsaved?.overlay.id);
      scene?.exitInteractiveMode();
      setEditing(null);
      setSaved(null);
      return;
    }

    // return the label to the last "saved" state
    if (label && unsaved) {
      store.set(current, {
        ...unsaved,
        data: label,
      } as AnnotationLabel);
      scene?.discardChanges();
    }
    setSaved(null);
    setEditing(null);
    //Make sure the undo stack is cleared
    CommandContextManager.instance().clearUndoRedoStack();
  }, [
    scene,
    setEditing,
    setSaved,
    revertLabel,
    removeOverlay,
    setStagedPolylineTransforms,
    setStagedCuboidTransforms,
    setSelectedLabelForAnnotation,
  ]);
}
