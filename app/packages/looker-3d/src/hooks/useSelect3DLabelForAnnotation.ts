import { useAnnotationEngine } from "@fiftyone/annotation";
import { useCallback } from "react";
import type { OverlayLabel } from "../labels/loader";
import type { Archetype3d } from "../types";

/**
 * Selecting a 3D label for annotation = writing the engine's interaction
 * anchor. The form follows the anchor (sidebar binding), and this surface's
 * scene-side state (transform controls, selection atoms) follows it through
 * {@link use3dInteractionAdapter} — one selection path for canvas clicks,
 * sidebar rows, and entrance labels.
 */
export const useSelect3DLabelForAnnotation = () => {
  const engine = useAnnotationEngine();

  return useCallback(
    (label: OverlayLabel, _archetype?: Archetype3d) => {
      if (!label._id || !label.path) {
        return;
      }

      engine.interaction.setActive([
        {
          sample: engine.ambientSample(),
          path: label.path,
          instanceId: label._id,
        },
      ]);
    },
    [engine]
  );
};
