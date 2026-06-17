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
    (reads) => !!entranceLabel && reads.getLabel(entranceLabel) !== undefined
  );

  useEffect(() => {
    if (!entranceLabel || !resolved) {
      return;
    }

    engine.interaction.setActive([entranceLabel]);
    clearEntranceLabel();
  }, [clearEntranceLabel, engine, entranceLabel, resolved]);
};
