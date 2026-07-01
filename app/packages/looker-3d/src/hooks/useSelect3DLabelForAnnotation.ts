import { useAnnotationEngine, useSceneSampleId } from "@fiftyone/annotation";
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
<<<<<<< HEAD
  const [transformMode, setTransformMode] = useRecoilState(transformModeAtom);
  const setSelectedLabelForAnnotation = useSetRecoilState(
    selectedLabelForAnnotationAtom,
  );
  const setCurrentArchetypeSelectedForTransform = useSetRecoilState(
    currentArchetypeSelectedForTransformAtom,
  );
=======
  const engine = useAnnotationEngine();
  // 3D labels belong to the pinned 3D scene's sample (the working-store key
  // the bridge registers), not the selected 2D slice in a grouped modal
  const sample = useSceneSampleId();
>>>>>>> main

  return useCallback(
    (label: OverlayLabel, _archetype?: Archetype3d) => {
      if (!label._id || !label.path || !sample) {
        return;
      }

      engine.interaction.setActive([
        {
          sample,
          path: label.path,
          instanceId: label._id,
        },
      ]);
    },
<<<<<<< HEAD
    [
      transformMode,
      setTransformMode,
      setSelectedLabelForAnnotation,
      setCurrent3dAnnotationMode,
      setCurrentArchetypeSelectedForTransform,
      setEditingToExistingPolyline,
      setEditingToExistingCuboid,
      annotationEventBus,
    ],
=======
    [engine, sample],
>>>>>>> main
  );
};
