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
import { currentOverlay, savedLabel } from "./state";
import useActivePrimitive from "./useActivePrimitive";

export default function useExit() {
  const setEditing = useSetAtom(editing);
  const [, setActivePrimitive] = useActivePrimitive();
  const setSaved = useSetAtom(savedLabel);
  const { scene } = useLighter();

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

    // reset editing state
    setSaved(null);
    setEditing(null);
    setActivePrimitive(null);
  }, [
    setStagedPolylineTransforms,
    setStagedCuboidTransforms,
    setSelectedLabelForAnnotation,
    setSaved,
    setEditing,
    setActivePrimitive,
    scene,
  ]);
}
