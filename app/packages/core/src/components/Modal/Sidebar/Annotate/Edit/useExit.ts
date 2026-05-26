import { useLighter } from "@fiftyone/lighter";
import { TypeGuards } from "@fiftyone/lighter/src/core/Scene2D";
import { useCallback } from "react";
import { useAnnotationContext } from "./useAnnotationContext";

export default function useExit() {
  const annotationContext = useAnnotationContext();
  const { scene, removeOverlay } = useLighter();
  const { label, overlay } = annotationContext.selected;

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

    // 3D state cleanup happens in looker-3d's useReset3dOnEditExit, which
    // reacts to the atom transition this clear() produces.
    annotationContext.clear();
  }, [annotationContext, label, overlay, removeOverlay, scene]);
}
