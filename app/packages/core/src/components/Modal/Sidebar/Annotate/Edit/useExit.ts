import { useLighter, useOverlayById } from "@fiftyone/lighter";
import { TypeGuards } from "@fiftyone/lighter/src/core/Scene2D";
import { selectedLabelForAnnotationAtom } from "@fiftyone/looker-3d/src/state";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { useCurrentOverlayId, useEditingLabel, useSetSavedLabelData, useStopEditing } from "../redux/hooks";
import useActivePrimitive from "./useActivePrimitive";

export default function useExit() {
  const stopEditing = useStopEditing();
  const [, setActivePrimitive] = useActivePrimitive();
  const setSaved = useSetSavedLabelData();
  const { scene, removeOverlay } = useLighter();
  const overlay = useOverlayById(useCurrentOverlayId());
  const label = useEditingLabel();

  /**
   * 3D SPECIFIC IMPORTS
   * : TODO: CLEAN THIS UP. THIS FUNCTION SHOULDN'T BE
   * COUPLED TO LIGHTER OR LOOKER-3D.
   */
  const setSelectedLabelForAnnotation = useSetRecoilState(
    selectedLabelForAnnotationAtom
  );
  /**
   * 3D SPECIFIC IMPORTS ENDS HERE.
   */

  return useCallback(() => {
    // If this is an uncommitted dummy label with no value, remove it from the scene
    if (label?.isNew && !label.label) {
      if (scene && !scene.isDestroyed && scene.renderLoopActive) {
        scene.exitInteractiveMode();
        removeOverlay(label.overlayId, true);
      }
    } else if (overlay) {
      scene?.deselectOverlay(overlay.id, { ignoreSideEffects: true });
      if (TypeGuards.isHoverable(overlay)) {
        overlay.onHoverLeave?.();
      }
    }

    /**
     * 3D SPECIFIC LOGIC
     * : TODO: CLEAN THIS UP. THIS FUNCTION SHOULDN'T BE
     * COUPLED TO LIGHTER OR LOOKER-3D.
     */
    setSelectedLabelForAnnotation(null);
    /**
     * 3D SPECIFIC LOGIC ENDS HERE.
     */

    // reset editing state
    setSaved(null);
    stopEditing();
    setActivePrimitive(null);
  }, [
    label,
    overlay,
    removeOverlay,
    scene,
    setActivePrimitive,
    stopEditing,
    setSaved,
  ]);
}
