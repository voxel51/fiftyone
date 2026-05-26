import { useLighter } from "@fiftyone/lighter";
import { TypeGuards } from "@fiftyone/lighter/src/core/Scene2D";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { current, currentOverlay } from "./useAnnotationContext/selectors";
import { useAnnotationContext } from "./useAnnotationContext";

export default function useExit() {
  const annotationContext = useAnnotationContext();
  const { scene, removeOverlay } = useLighter();
  const overlay = useAtomValue(currentOverlay);
  const label = useAtomValue(current);

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

    // Records last-used into useAnnotationContext memory and resets
    // editing/savedLabel/activePrimitive atoms. The atom transition is
    // picked up by looker-3d's `useReset3dOnEditExit` hook, which owns the
    // 3D-specific selection/transform cleanup — keeping this file in the
    // editing-state layer rather than reaching across packages.
    annotationContext.clear();
  }, [annotationContext, label, overlay, removeOverlay, scene]);
}
