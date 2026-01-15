import {
  BoundingBoxOverlay,
  TransformOverlayCommand,
  UpdateLabelCommand,
  useLighter,
} from "@fiftyone/lighter";
import { TypeGuards } from "@fiftyone/lighter/src/core/Scene2D";
import {
  selectedLabelForAnnotationAtom,
  stagedCuboidTransformsAtom,
  stagedPolylineTransformsAtom,
} from "@fiftyone/looker-3d/src/state";
import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { editing } from ".";
import {
  current,
  currentOverlay,
  hasChanges,
  primitivePath,
  savedLabel,
} from "./state";

export default function useExit(revertLabel = true) {
  const setEditing = useSetAtom(editing);
  const setPrimitive = useSetAtom(primitivePath);
  const setSaved = useSetAtom(savedLabel);
  const { scene, removeOverlay } = useLighter();
  const overlay = useAtomValue(currentOverlay);
  const hasChanged = useAtomValue(hasChanges);

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

    // We are leaving editing mode, clear the stack
    scene?.clearUndoRedoStack();

    const resetEditingState = () => {
      setSaved(null);
      setEditing(null);
      setPrimitive(null);
    };

    if (!label || !revertLabel) {
      resetEditingState();
      return;
    }

    // label has not been persisted, so remove it
    if (unsaved?.isNew) {
      removeOverlay(unsaved?.overlay.id);
      scene?.exitInteractiveMode();
      resetEditingState();
      return;
    }

    // return the label to the last "saved" state
    if (label && unsaved) {
      store.set(current, {
        ...unsaved,
        data: label,
      });
    }

    if (overlay) {
      scene?.executeCommand(
        new UpdateLabelCommand(overlay, overlay.label, label)
      );

      if (
        hasChanged &&
        overlay instanceof BoundingBoxOverlay &&
        overlay.label.bounding_box
      ) {
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

    resetEditingState();
  }, [
    scene,
    setEditing,
    setSaved,
    overlay,
    revertLabel,
    removeOverlay,
    setStagedPolylineTransforms,
    setStagedCuboidTransforms,
    setSelectedLabelForAnnotation,
    setStagedCuboidTransforms,
  ]);
}
