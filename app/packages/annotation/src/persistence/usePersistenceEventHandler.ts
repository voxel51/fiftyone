import {
  ConcurrencyLimitBehavior,
  useConcurrentCallback,
} from "@fiftyone/utilities/src/useConcurrentCallback";
import { useCallback, useEffect, useRef } from "react";
import { useAnnotationEventBus } from "../hooks";
import { usePersistAnnotationDeltas } from "./usePersistAnnotationDeltas";

/**
 * Hook which returns a handler for the
 * "annotation:persistenceRequested" event.
 */
export const usePersistenceEventHandler = () => {
  const eventBus = useAnnotationEventBus();
  const persistAnnotationDeltas = usePersistAnnotationDeltas();

  // After a PATCH response, `refreshSample` queues React state updates but
  // closures (version token, delta base sample) remain stale until the next
  // render. This ref gates the next save attempt so it cannot fire until
  // React has re-rendered and all hooks hold up-to-date values.
  const awaitingRenderRef = useRef(false);
  useEffect(() => {
    awaitingRenderRef.current = false;
  });

  return useConcurrentCallback(
    useCallback(async () => {
      // Skip until React has re-rendered with the latest sample data;
      // the next auto-save tick will pick up pending changes.
      if (awaitingRenderRef.current) {
        return;
      }

      try {
        const success = await persistAnnotationDeltas();

        if (success === null) {
          // no-op — no pending changes, no render gate needed
        } else if (success) {
          awaitingRenderRef.current = true;
          eventBus.dispatch("annotation:persistenceSuccess");
        } else {
          awaitingRenderRef.current = true;
          eventBus.dispatch("annotation:persistenceError", {
            error: new Error("Server rejected changes"),
          });
        }
      } catch (error) {
        awaitingRenderRef.current = true;
        eventBus.dispatch("annotation:persistenceError", { error });
      }
    }, [eventBus, persistAnnotationDeltas]),
    // limit to 1 operation, dropping any requests that come in while in-flight
    { maxConcurrency: 1, limitBehavior: ConcurrencyLimitBehavior.DROP }
  );
};
