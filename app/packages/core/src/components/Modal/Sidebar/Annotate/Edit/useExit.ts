import { useAnnotationEngine } from "@fiftyone/annotation";
import { useLighter } from "@fiftyone/lighter";
import { TypeGuards } from "@fiftyone/lighter/src/core/Scene2D";
import type { AnnotationLabel } from "@fiftyone/state";
import {
  DETECTION,
  hasValidBounds,
  KEYPOINT,
  POLYLINE,
} from "@fiftyone/utilities";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { editing } from ".";
import { current, currentOverlay } from "./state";
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
  const engine = useAnnotationEngine();
  const setEditing = useSetAtom(editing);
  const [, setActivePrimitive] = useActivePrimitive();
  const { scene, removeOverlay } = useLighter();
  const overlay = useAtomValue(currentOverlay);
  const label = useAtomValue(current);

  return useCallback(() => {
    // If this is an uncommitted dummy label (e.g. create-button click with no
    // shape drawn), remove it from the scene. Label-less labels with actual
    // geometry are valid and must be preserved.
    if (label?.isNew && !hasDrawnContent(label)) {
      if (scene && !scene.isDestroyed && scene.renderLoopActive) {
        scene.exitInteractiveMode();
        removeOverlay(label.data._id, true);
      }
    } else if (overlay && TypeGuards.isHoverable(overlay)) {
      // selection deselect is engine-routed — `setActive([])` below drives the
      // Lighter bridge's applySelected(false); only hover still needs a direct
      // poke (it isn't engine-routed on exit yet).
      overlay.onHoverLeave?.();
    }

    // reset editing state
    setEditing(null);
    setActivePrimitive(null);
    // every exit path funnels through here — release the engine selection
    // too (idempotent; no-op when the anchor-clear invoked us). Surfaces
    // clear their own scene state through their engine adapters (the 3D
    // adapter watches the anchor — no direct looker-3d pokes here).
    engine.interaction.setActive([]);
  }, [
    engine,
    label,
    overlay,
    removeOverlay,
    scene,
    setActivePrimitive,
    setEditing,
  ]);
}
