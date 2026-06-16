import { DetectionOverlay, useLighter } from "@fiftyone/lighter";
import { TypeGuards } from "@fiftyone/lighter/src/core/Scene2D";
import type { AnnotationLabel } from "@fiftyone/state";
import {
  DETECTION,
  hasValidBounds,
  KEYPOINT,
  POLYLINE,
} from "@fiftyone/utilities";
import { useCallback } from "react";
import { useAnnotationContext } from "./useAnnotationContext";

/**
 * True when the user has produced something to commit — a picked class, a
 * drawn bbox, or placed points. Used to distinguish a real (but possibly
 * label-less) annotation from a "clicked create but didn't draw" dummy.
 */
const hasDrawnContent = (
  label: AnnotationLabel,
  overlay?: AnnotationLabel["overlay"]
): boolean => {
  // A picked class is content on its own and also covers shapes we don't
  // introspect here (e.g. 3D detections).
  if (label.data.label) {
    return true;
  }

  switch (label.type) {
    case DETECTION:
      // `data.bounding_box` is only synced to the overlay's geometry once
      // the edit form mounts, so consult the overlay's live bounds first
      if (overlay instanceof DetectionOverlay) {
        return overlay.hasValidBounds();
      }

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
  const annotationContext = useAnnotationContext();
  const { clear } = annotationContext;
  const { scene, removeOverlay } = useLighter();
  const { label, overlay } = annotationContext.selected ?? {
    label: null,
    overlay: undefined,
  };

  return useCallback(() => {
    // If this is an uncommitted dummy label (e.g. create-button click with no
    // shape drawn), remove it from the scene. Label-less labels with actual
    // geometry are valid and must be preserved.
    if (label?.isNew && !hasDrawnContent(label, overlay)) {
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
    clear();
  }, [clear, label, overlay, removeOverlay, scene]);
}
