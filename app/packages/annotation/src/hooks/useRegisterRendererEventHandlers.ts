import { useEffect } from "react";
import { useEngineSelector } from "../engine";
import {
  useAnnotationEngine,
  useClearEntranceLabel,
  useEntranceLabel,
} from "../state";

/**
 * Hook which registers event handlers related to renderer events.
 *
 * This should be called once in the composition root.
 */
export const useRegisterRendererEventHandlers = () => {
  const engine = useAnnotationEngine();

  const entranceLabel = useEntranceLabel();
  const clearEntranceLabel = useClearEntranceLabel();

  // If we entered annotation mode via direct label edit (e.g. via the label's
  // tooltip) or need to auto-edit a label (e.g. patches view), open it for
  // editing once the engine knows it.

<<<<<<< HEAD
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
      [clearEntranceLabelId, entranceLabelId, scene],
    ),
=======
  // Write the ENGINE anchor, not a scene — every surface's read-half follows
  // the anchor (the bridge loop reapplies interaction state to fresh handles;
  // the 3D adapter watches the anchor against its working store), so the
  // handoff survives scene re-creation (e.g. the explore→annotate switch
  // tears the scene down after hydration), and the form opens via the anchor
  // with no scene dependency at all. Readiness is the engine resolving the
  // ref (re-evaluated on engine ticks, so store registration/hydration
  // re-fires it).
  const resolved = useEngineSelector(
    engine,
    (reads) => !!entranceLabel && reads.getLabel(entranceLabel) !== undefined,
>>>>>>> main
  );

  useEffect(() => {
    if (!entranceLabel || !resolved) {
      return;
    }

<<<<<<< HEAD
  // For 3D, we can listen to changes in the working label set and select
  // the label once it's available.
  useEffect(() => {
    if (entranceLabelId) {
      const labels3D = [...detections3D, ...polylines3D];
      const targetLabel = labels3D.find(
        (label) => label._id === entranceLabelId,
      );

      if (targetLabel) {
        select3DLabel({ ...targetLabel, selected: true });

        clearEntranceLabelId();
      }
    }
  }, [detections3D, entranceLabelId, polylines3D]);
=======
    engine.interaction.setActive([entranceLabel]);
    clearEntranceLabel();
  }, [clearEntranceLabel, engine, entranceLabel, resolved]);
>>>>>>> main
};
