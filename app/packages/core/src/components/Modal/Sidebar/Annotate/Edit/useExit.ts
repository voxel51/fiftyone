import {
  BoundingBoxOverlay,
  TransformOverlayCommand,
  UpdateLabelCommand,
  useLighter,
} from "@fiftyone/lighter";
import {
  stagedPolylineTransformsAtom,
  selectedLabelForAnnotationAtom,
} from "@fiftyone/looker-3d/src/state";
import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { editing } from ".";
import { current, currentData, currentOverlay, savedLabel } from "./state";

export default function useExit(revertLabel = true) {
  const setEditing = useSetAtom(editing);
  const setSaved = useSetAtom(savedLabel);
  const { scene, removeOverlay } = useLighter();
  const overlay = useAtomValue(currentOverlay);

  /**
   * 3D SPECIFIC IMPORTS
   * : TODO: CLEAN THIS UP. THIS FUNCTION SHOULDN'T BE
   * COUPLED TO LIGHTER OR LOOKER-3D.
   */

  const setStagedPolylineTransforms = useSetRecoilState(
    stagedPolylineTransformsAtom
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
      scene?.deselectOverlay(overlay.id);
      overlay.onHoverLeave();
    }

    const label = store.get(savedLabel);
    const unsaved = store.get(current);

    /**
     * 3D SPECIFIC LOGIC
     * : TODO: CLEAN THIS UP. THIS FUNCTION SHOULDN'T BE
     * COUPLED TO LIGHTER OR LOOKER-3D.
     */
    setStagedPolylineTransforms({});
    setSelectedLabelForAnnotation(null);
    /**
     * 3D SPECIFIC LOGIC ENDS HERE.
     */

    // We are leaving editing mode, clear the stack
    scene?.clearUndoRedoStack();

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
    label && store.set(currentData, label);

    if (overlay) {
      scene?.executeCommand(
        new UpdateLabelCommand(overlay, overlay.label, label)
      );

      if (overlay instanceof BoundingBoxOverlay) {
        overlay.label.bounding_box &&
          scene?.executeCommand(
            new TransformOverlayCommand(
              overlay,
              overlay.id,
              overlay.getAbsoluteBounds(),
              scene?.convertRelativeToAbsolute(overlay.label.bounding_box)
            )
          );
      }
    }

    setSaved(null);
    setEditing(null);
  }, [
    scene,
    setEditing,
    setSaved,
    overlay,
    revertLabel,
    removeOverlay,
    setStagedPolylineTransforms,
    setSelectedLabelForAnnotation,
  ]);
}
