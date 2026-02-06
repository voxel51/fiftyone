import { useAnnotationContextManager } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useAnnotationContextManager";
import { useLighter, useLighterEventHandler } from "@fiftyone/lighter";
import { useCallback, useEffect } from "react";
import { useSelect3DLabelForAnnotation } from "@fiftyone/looker-3d/src/hooks";
import { useWorkingDetections, useWorkingPolylines } from "@fiftyone/looker-3d";

/**
 * Hook which registers event handlers related to renderer events.
 *
 * This should be called once in the composition root.
 */
export const useRegisterRendererEventHandlers = () => {
  const { scene } = useLighter();
  const handleLighterEvent = useLighterEventHandler(scene?.getEventChannel());

  const select3DLabel = useSelect3DLabelForAnnotation();
  const labels3D = [...useWorkingDetections(), ...useWorkingPolylines()];

  const { entranceLabelId, clearEntranceLabelId } =
    useAnnotationContextManager();

  // If we entered annotation mode via direct label edit (e.g. via the label's tooltip),
  // we want to open the label for editing once it's been initialized and
  // added to the rendered scene.

  // For 2D, we can listen to the overlay-added event and select the relevant
  // label once it's available.
  handleLighterEvent(
    "lighter:overlay-added",
    useCallback(
      (evt) => {
        if (scene && entranceLabelId && evt.overlay.id === entranceLabelId) {
          scene.selectOverlay(evt.overlay.id);

          // one-time event; clear the selection criteria
          clearEntranceLabelId();
        }
      },
      [clearEntranceLabelId, entranceLabelId, scene]
    )
  );

  // For 3D, we can listen to changes in the working label set and select
  // the label once it's available.
  useEffect(() => {
    if (entranceLabelId && labels3D) {
      const targetLabel = labels3D.find(
        (label) => label._id === entranceLabelId
      );

      if (targetLabel) {
        select3DLabel({ ...targetLabel, selected: true });

        clearEntranceLabelId();
      }
    }
  }, [entranceLabelId, labels3D]);
};
