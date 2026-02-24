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
  const detections3D = useWorkingDetections();
  const polylines3D = useWorkingPolylines();

  const { entranceLabelId, clearEntranceLabelId } =
    useAnnotationContextManager();

  // If we entered annotation mode via direct label edit (e.g. via the label's tooltip)
  // or need to auto-edit a label (e.g. patches view), we want to open the label
  // for editing once it's been initialized and added to the rendered scene.

  // For 2D, we listen to the overlay-added event and select the relevant
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

  // Handle the case where the overlay is already in the scene when
  // entranceLabelId is set (e.g. patches view auto-edit, where overlays are
  // added before the auto-edit logic determines which label to activate).
  useEffect(() => {
    if (scene && entranceLabelId && scene.hasOverlay(entranceLabelId)) {
      scene.selectOverlay(entranceLabelId);
      clearEntranceLabelId();
    }
  }, [scene, entranceLabelId, clearEntranceLabelId]);

  // For 3D, we can listen to changes in the working label set and select
  // the label once it's available.
  useEffect(() => {
    if (entranceLabelId) {
      const labels3D = [...detections3D, ...polylines3D];
      const targetLabel = labels3D.find(
        (label) => label._id === entranceLabelId
      );

      if (targetLabel) {
        select3DLabel({ ...targetLabel, selected: true });

        clearEntranceLabelId();
      }
    }
  }, [detections3D, entranceLabelId, polylines3D]);
};
