import { useAnnotationEngine } from "@fiftyone/annotation";
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
import { usePrimitiveController } from "./useActivePrimitive";
import { useAnnotationContext } from "./useAnnotationContext";

/**
 * True when the user has produced something to commit — a picked class, a
 * drawn bbox, or placed points. Used to distinguish a real (but possibly
 * label-less) annotation from a "clicked create but didn't draw" dummy.
 */
const hasDrawnContent = (
  label: AnnotationLabel,
  overlay?: AnnotationLabel["overlay"],
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
  const engine = useAnnotationEngine();
  const annotationContext = useAnnotationContext();
  const { clear } = annotationContext;
  const { setActivePrimitive } = usePrimitiveController();
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
    } else if (overlay && TypeGuards.isHoverable(overlay)) {
      // selection deselect is engine-routed — `setActive([])` below drives the
      // Lighter bridge's applySelected(false); only hover still needs a direct
      // poke (it isn't engine-routed on exit yet). The redundant sidebar→Lighter
      // scene.deselectOverlay is intentionally dropped.
      overlay.onHoverLeave?.();
    }

    // reset the sidebar form + primitive editor
    clear();
    setActivePrimitive(null);
    // release the engine selection so form-follows-anchor doesn't immediately
    // re-open the form; surfaces clear their own scene state via their engine
    // adapters (the 3D adapter + useReset3dOnEditExit watch the anchor).
    engine.interaction.setActive([]);
  }, [clear, engine, label, overlay, removeOverlay, scene, setActivePrimitive]);
}
