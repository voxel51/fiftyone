import { useLighter } from "@fiftyone/lighter";
import { TypeGuards } from "@fiftyone/lighter/src/core/Scene2D";
import { selectedLabelForAnnotationAtom } from "@fiftyone/looker-3d/src/state";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { editing } from ".";
import { current, currentOverlay, savedLabel } from "./state";
import useActivePrimitive from "./useActivePrimitive";

export default function useExit() {
  const setEditing = useSetAtom(editing);
  const [, setActivePrimitive] = useActivePrimitive();
  const setSaved = useSetAtom(savedLabel);
  const { scene, removeOverlay } = useLighter();
  const overlay = useAtomValue(currentOverlay);
  const label = useAtomValue(current);

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
    if (label?.isNew && !label.data.label) {
      if (scene && !scene.isDestroyed && scene.renderLoopActive) {
        scene.exitInteractiveMode();
        removeOverlay(label.data._id, true);
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
    setEditing(null);
    setActivePrimitive(null);
  }, [
    label,
    overlay,
    removeOverlay,
    scene,
    setActivePrimitive,
    setEditing,
    setSaved,
  ]);
}
