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

// return useCallback(() => {
//   const store = getDefaultStore();
//
//   const resetEditingState = () => {
//     setSaved(null);
//     setEditing(null);
//     setActivePrimitive(null);
//   };
//
//   // Wrap the entire exit logic in try-catch to ensure editing state is
//   // always reset, even if the editing atom becomes stale (e.g., during
//   // navigation when the underlying labels array changes).
//   try {
//     const overlay = store.get(currentOverlay);
//
//     if (overlay) {
//       scene?.deselectOverlay(overlay.id, { ignoreSideEffects: true });
//       if (TypeGuards.isHoverable(overlay)) {
//         overlay.onHoverLeave?.();
//       }
//     }
//
//     const label = store.get(savedLabel);
//     let unsaved;
//     try {
//       unsaved = store.get(current);
//     } catch {
//       // current atom may be stale, skip revert logic
//       unsaved = null;
//     }
//
//     /**
//      * 3D SPECIFIC LOGIC
//      * : TODO: CLEAN THIS UP. THIS FUNCTION SHOULDN'T BE
//      * COUPLED TO LIGHTER OR LOOKER-3D.
//      */
//     setStagedPolylineTransforms({});
//     setStagedCuboidTransforms({});
//     setSelectedLabelForAnnotation(null);
//     /**
//      * 3D SPECIFIC LOGIC ENDS HERE.
//      */
//
//     CommandContextManager.instance().clearUndoRedoStack();
//
//     if (!label || !revertLabel) {
//       resetEditingState();
//       return;
//     }
//
//     // label has not been persisted, so remove it
//     if (unsaved?.isNew) {
//       removeOverlay(unsaved?.overlay.id);
//       scene?.exitInteractiveMode();
//       resetEditingState();
//       return;
//     }
//
//     // return the label to the last "saved" state
//     if (label && unsaved) {
//       try {
//         store.set(current, {
//           ...unsaved,
//           data: label,
//         });
//       } catch {
//         // The editing atom may be stale, safe to ignore since we're exiting
//       }
//     }
//
//     if (overlay) {
//       scene?.executeCommand(
//         new UpdateLabelCommand(overlay, overlay.label, label)
//       );
//
//       if (
//         hasChanged &&
//         overlay instanceof BoundingBoxOverlay &&
//         overlay.label.bounding_box
//       ) {
//         scene?.executeCommand(
//           new TransformOverlayCommand(
//             overlay,
//             overlay.id,
//             overlay.getAbsoluteBounds(),
//             scene?.convertRelativeToAbsolute(overlay.label.bounding_box)
//           )
//         );
//       }
//     }
//
//     resetEditingState();
//   } catch {
//     // Ensure editing state is always reset even if something fails
//     resetEditingState();
//   }
// }, [
//   scene,
//   setEditing,
//   setSaved,
//   overlay,
//   revertLabel,
//   removeOverlay,
//   setStagedPolylineTransforms,
//   setStagedCuboidTransforms,
//   setSelectedLabelForAnnotation,
//   setStagedCuboidTransforms,
// ]);
// }
