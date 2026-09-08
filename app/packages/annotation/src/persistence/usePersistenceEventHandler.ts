import {
  ConcurrencyLimitBehavior,
  useConcurrentCallback,
} from "@fiftyone/utilities/src/useConcurrentCallback";
import { useCallback } from "react";
import { useAnnotationEventBus } from "../hooks";
import { useAnnotationEngine } from "../state";
import { usePersistAnnotationDeltas } from "./usePersistAnnotationDeltas";

/**
 * Hook which returns a handler for the
 * "annotation:persistenceRequested" event.
 */
export const usePersistenceEventHandler = () => {
  const engine = useAnnotationEngine();
  const eventBus = useAnnotationEventBus();
  const persistAnnotationDeltas = usePersistAnnotationDeltas();

  return useConcurrentCallback(
    useCallback(async () => {
      // engine state as of this pass; if the version moves while the patch
      // is in flight (an edit landed mid-save), the pass did NOT settle the
      // engine — the next pass persists the newer state
      const version = engine.getVersion();

      try {
        const success = await persistAnnotationDeltas();

        if (success === null) {
          // nothing pending at this version — settled
          eventBus.dispatch("annotation:persistenceSettled");
        } else if (success) {
          eventBus.dispatch("annotation:persistenceSuccess");

          if (engine.getVersion() === version) {
            eventBus.dispatch("annotation:persistenceSettled");
          }
        } else {
          eventBus.dispatch("annotation:persistenceError", {
            error: new Error("Server rejected changes"),
          });
        }
      } catch (error) {
        eventBus.dispatch("annotation:persistenceError", { error });
      }
    }, [engine, eventBus, persistAnnotationDeltas]),
    // limit to 1 operation, dropping any requests that come in while in-flight
    { maxConcurrency: 1, limitBehavior: ConcurrencyLimitBehavior.DROP },
  );
};
