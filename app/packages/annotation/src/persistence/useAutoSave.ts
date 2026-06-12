import { useEffect } from "react";
import { useAnnotationEventBus } from "../hooks";

/**
 * Hook which emits a persistence request at the specified interval.
 *
 * Edits are consolidated client-side (the pending-edits ledger nets them per
 * label), so each tick produces at most one save request, covering everything
 * since the last one.
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

      // Best-effort flush when the page is being hidden/unloaded (tab close,
      // browser refresh) so edits made within the last interval still reach
      // the server. The batch snapshot is synchronous; only the network write
      // races teardown.
      const flushNow = () => {
        eventBus.dispatch("annotation:persistenceRequested");
      };
      const flushOnHidden = () => {
        if (document.visibilityState === "hidden") {
          flushNow();
        }
      };
      window.addEventListener("pagehide", flushNow);
      document.addEventListener("visibilitychange", flushOnHidden);

      return () => {
        clearInterval(intervalHandle);
        window.removeEventListener("pagehide", flushNow);
        document.removeEventListener("visibilitychange", flushOnHidden);
        // Final flush on exit from the annotation context (mode switch or
        // unmount) so edits never wait on a tick that will not come. With no
        // pending edits this is a local no-op.
        eventBus.dispatch("annotation:persistenceRequested");
      };
    }

    return undefined;
  }, [autoSaveInterval, enabled, eventBus]);
};
