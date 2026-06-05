import { useLighter } from "@fiftyone/lighter";
import { TypeGuards } from "@fiftyone/lighter/src/core/Scene2D";
import {
  clearTransformStateSelector,
  selectedLabelForAnnotationAtom,
} from "@fiftyone/looker-3d/src/state";
import type { AnnotationLabel } from "@fiftyone/state";
import {
  DETECTION,
  hasValidBounds,
  KEYPOINT,
  POLYLINE,
} from "@fiftyone/utilities";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { editing } from ".";
import { current, currentOverlay, savedLabel } from "./state";
import useActivePrimitive from "./useActivePrimitive";

/**
 * True when the user has produced something to commit — a picked class, a
 * drawn bbox, or placed points. Used to distinguish a real (but possibly
 * label-less) annotation from a "clicked create but didn't draw" dummy.
 */
const hasDrawnContent = (label: AnnotationLabel): boolean => {
  // A picked class is content on its own and also covers shapes we don't
  // introspect here (e.g. 3D detections).
  if (label.data.label) {
    return true;
  }

  switch (label.type) {
    case DETECTION:
      return (
        Array.isArray(label.data.bounding_box) &&
        hasValidBounds(label.data.bounding_box)
      );
    case POLYLINE:
    case KEYPOINT:
      return (label.data.points?.length ?? 0) > 0;
    default:
      return false;
  }
};

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
  const clearTransformState = useSetRecoilState(clearTransformStateSelector);
  /**
   * 3D SPECIFIC IMPORTS ENDS HERE.
   */

  return useCallback(() => {
    // If this is an uncommitted dummy label (e.g. create-button click with no
    // shape drawn), remove it from the scene. Label-less labels with actual
    // geometry are valid and must be preserved.
    if (label?.isNew && !hasDrawnContent(label)) {
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

    // reset editing state
    setSaved(null);
    setEditing(null);
    setActivePrimitive(null);
  }, [
    clearTransformState,
    label,
    overlay,
    removeOverlay,
    scene,
    setActivePrimitive,
    setEditing,
    setSaved,
  ]);
}
