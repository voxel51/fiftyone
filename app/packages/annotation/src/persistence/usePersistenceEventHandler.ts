import { useCallback, useRef } from "react";
import { useAnnotationEventBus } from "../hooks";
import { usePersistAnnotationDeltas } from "./usePersistAnnotationDeltas";

/**
 * Hook which returns a handler for the
 * "annotation:persistenceRequested" event.
 *
 * Flushes are single-flight: at most one save is on the wire at a time. A
 * request that arrives while a flush is in flight is coalesced into one
 * trailing pass (never dropped) — an exit/navigation flush always lands, and
 * any number of requests within a flush window produce at most one more save.
 */
export const usePersistenceEventHandler = () => {
  const eventBus = useAnnotationEventBus();
  const persistAnnotationDeltas = usePersistAnnotationDeltas();

  // The latest persist callback, so a trailing pass uses fresh state without
  // destabilizing the returned handler's identity.
  const persistRef = useRef(persistAnnotationDeltas);
  persistRef.current = persistAnnotationDeltas;

  const inFlightRef = useRef(false);
  const trailingRef = useRef(false);

  return useCallback(async () => {
    if (inFlightRef.current) {
      trailingRef.current = true;
      return;
    }

    inFlightRef.current = true;
    try {
      do {
        trailingRef.current = false;
        try {
          const success = await persistRef.current();

          if (success === null) {
            // no-op — nothing to persist
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
      } while (trailingRef.current);
    } finally {
      inFlightRef.current = false;
    }
  }, [eventBus]);
};
