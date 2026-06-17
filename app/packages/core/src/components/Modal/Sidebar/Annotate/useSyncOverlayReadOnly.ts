import { useAnnotationEngine } from "@fiftyone/annotation";
import {
  DetectionOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useAtomValue } from "jotai";
import { useCallback, useEffect } from "react";
import {
  isFieldReadOnly,
  labelSchemasData,
  visibleLabelSchemas,
} from "./state";

/**
 * Apply each detection overlay's draggable/resizeable flags from its field's
 * schema read-only state.
 *
 * Lives in the Lighter bridge layer (mounted from {@link useLighterAnnotationBridge}),
 * NOT the sidebar list — the sidebar must never reach into Lighter overlays.
 * The label set is sourced from the engine + scene, never the row-atom mirror.
 * Re-applies on schema read-only changes (Schema Manager toggle), and when a
 * new overlay mounts (hydration, create, a field-move re-home).
 */
export const useSyncOverlayReadOnly = (sample: string): void => {
  const engine = useAnnotationEngine();
  const { scene } = useLighter();
  const schemas = useAtomValue(labelSchemasData);
  const active = useAtomValue(visibleLabelSchemas);

  const apply = useCallback(() => {
    if (!schemas || !scene || !sample) {
      return;
    }

    for (const path of active) {
      const readOnly = isFieldReadOnly(schemas[path]);

      for (const label of engine.listLabels({ sample, path })) {
        const overlay = scene.getOverlay(label._id);

        if (overlay instanceof DetectionOverlay) {
          overlay.setDraggable(!readOnly);
          overlay.setResizeable(!readOnly);
        }
      }
    }
  }, [active, engine, sample, scene, schemas]);

  useEffect(() => {
    apply();
  }, [apply]);

  const on = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );
  on(
    "lighter:overlay-added",
    useCallback(() => apply(), [apply])
  );
};
