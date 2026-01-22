import { useEffect } from "react";
import { useAnnotationEventBus } from "../hooks";

/**
 * Hook which emits a persistence request at the specified interval.
 *
 * @param enabled If true, enables auto-save functionality
 * @param autoSaveInterval Interval in milliseconds to trigger persistence
 */
export const useAutoSave = (enabled = false, autoSaveInterval = 3_000) => {
  const eventBus = useAnnotationEventBus();

  useEffect(() => {
    if (enabled) {
      const intervalHandle = setInterval(() => {
        eventBus.dispatch("annotation:persistenceRequested");
      }, autoSaveInterval);

      return () => clearInterval(intervalHandle);
    }
  }, [autoSaveInterval, enabled, eventBus]);
};
