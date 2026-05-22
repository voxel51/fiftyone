import { useLighter } from "@fiftyone/lighter";
import { TypeGuards } from "@fiftyone/lighter/src/core/Scene2D";
import {
  clearTransformStateSelector,
  selectedLabelForAnnotationAtom,
} from "@fiftyone/looker-3d/src/state";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { current, currentOverlay } from "./state";
import { useAnnotationContext } from "./useAnnotationContext";

export default function useExit() {
  const annotationContext = useAnnotationContext();
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
  const clearTransformState = useSetRecoilState(clearTransformStateSelector);
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
    clearTransformState(null);
    /**
     * 3D SPECIFIC LOGIC ENDS HERE.
     */

    // Records last-used into useAnnotationContext memory and resets
    // editing/savedLabel/activePrimitive atoms.
    annotationContext.clear();
  }, [
    annotationContext,
    clearTransformState,
    label,
    overlay,
    removeOverlay,
    scene,
    setSelectedLabelForAnnotation,
  ]);
}
