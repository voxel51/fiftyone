import { useAnnotationContextManager } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useAnnotationContextManager";
import { useEffect } from "react";
import { useSelect3DLabelForAnnotation } from "@fiftyone/looker-3d/src/hooks";
import { useWorkingDetections, useWorkingPolylines } from "@fiftyone/looker-3d";
import { useEngineSelector } from "../engine";
import { useAnnotationEngine } from "../state";

/**
 * Hook which registers event handlers related to renderer events.
 *
 * This should be called once in the composition root.
 */
export const useRegisterRendererEventHandlers = () => {
  const engine = useAnnotationEngine();

  const select3DLabel = useSelect3DLabelForAnnotation();
  const detections3D = useWorkingDetections();
  const polylines3D = useWorkingPolylines();

  const { entranceLabel, clearEntranceLabel } = useAnnotationContextManager();

  // If we entered annotation mode via direct label edit (e.g. via the label's
  // tooltip) or need to auto-edit a label (e.g. patches view), open it for
  // editing once the engine knows it.

  // 2D: write the ENGINE anchor, not the scene — scene selection follows via
  // the bridge loop (which reapplies interaction state to every fresh
  // handle), so the handoff survives scene re-creation (e.g. the
  // explore→annotate switch tears the scene down after hydration), and the
  // form opens via the anchor with no scene dependency at all. Readiness is
  // the engine resolving the ref (re-evaluated on engine ticks, so store
  // registration/hydration re-fires it).
  const resolved = useEngineSelector(
    engine,
    (reads) => !!entranceLabel && reads.getLabel(entranceLabel) !== undefined
  );

  useEffect(() => {
    if (!entranceLabel || !resolved) {
      return;
    }

    engine.interaction.setActive([entranceLabel]);
    clearEntranceLabel();
  }, [clearEntranceLabel, engine, entranceLabel, resolved]);

  // For 3D, we can listen to changes in the working label set and select
  // the label once it's available.
  useEffect(() => {
    if (entranceLabel) {
      const labels3D = [...detections3D, ...polylines3D];
      const targetLabel = labels3D.find(
        (label) => label._id === entranceLabel.instanceId
      );

      if (targetLabel) {
        select3DLabel({ ...targetLabel, selected: true });

        clearEntranceLabel();
      }
    }
  }, [
    clearEntranceLabel,
    detections3D,
    entranceLabel,
    polylines3D,
    select3DLabel,
  ]);
};
