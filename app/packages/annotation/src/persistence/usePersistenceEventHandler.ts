import {
  ConcurrencyLimitBehavior,
  useConcurrentCallback,
} from "@fiftyone/utilities/src/useConcurrentCallback";
import { useCallback } from "react";
import { useAnnotationEventBus } from "../hooks";
import { usePersistAnnotationDeltas } from "./usePersistAnnotationDeltas";

/**
 * Hook which returns a handler for the
 * "annotation:persistenceRequested" event.
 */
export const usePersistenceEventHandler = () => {
  const eventBus = useAnnotationEventBus();
  const persistAnnotationDeltas = usePersistAnnotationDeltas();

  return useConcurrentCallback(
    useCallback(async () => {
      try {
        const success = await persistAnnotationDeltas();

        if (success === null) {
          // no-op
        } else if (success) {
          eventBus.dispatch("annotation:persistenceSuccess");
        } else {
          eventBus.dispatch("annotation:persistenceError", {
            error: new Error("Server rejected changes"),
          });
        }
      } catch (error) {
        eventBus.dispatch("annotation:persistenceError", { error });
      }
    }, [eventBus, persistAnnotationDeltas]),
    // limit to 1 operation, dropping any requests that come in while in-flight
    { maxConcurrency: 1, limitBehavior: ConcurrencyLimitBehavior.DROP }
  );
};
