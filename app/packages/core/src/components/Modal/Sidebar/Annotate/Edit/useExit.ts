import {
  BoundingBoxOverlay,
  TransformOverlayCommand,
  UpdateLabelCommand,
  useLighter,
} from "@fiftyone/lighter";
import {
  polylinePointTransformsAtom,
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

  const setPolylinePointTransforms = useSetRecoilState(
    polylinePointTransformsAtom
  );
  const setSelectedLabelForAnnotation = useSetRecoilState(
    selectedLabelForAnnotationAtom
  );
  /**
   * 3D SPECIFIC IMPORTS ENDS HERE.
   */

  return useCallback(() => {
    const store = getDefaultStore();
    store.get(currentOverlay)?.setSelected?.(false);
    const label = store.get(savedLabel);
    const unsaved = store.get(current);

    /**
     * 3D SPECIFIC LOGIC
     * : TODO: CLEAN THIS UP. THIS FUNCTION SHOULDN'T BE
     * COUPLED TO LIGHTER OR LOOKER-3D.
     */
    setPolylinePointTransforms(null);
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
    label && store.set(currentData, label);

    overlay &&
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

    setSaved(null);
    setEditing(null);
  }, [
    scene,
    setEditing,
    setSaved,
    overlay,
    revertLabel,
    removeOverlay,
    setPolylinePointTransforms,
    setSelectedLabelForAnnotation,
  ]);
}
