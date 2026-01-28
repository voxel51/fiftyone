import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { quickDrawActiveAtom, current } from "./state";
import { isSavingAtom } from "./useSave";

/**
 * Hook that auto-triggers save when a detection overlay is complete
 * in quick draw mode.
 *
 * Listens for the "detection-complete" event dispatched by
 * InteractiveDetectionHandler when a bounding box is finished.
 */
export const useAutoSaveOnCompletion = (save: () => Promise<void>) => {
  const isQuickDrawMode = useAtomValue(quickDrawActiveAtom);
  const currentLabel = useAtomValue(current);
  const isSaving = useAtomValue(isSavingAtom);

  useEffect(() => {
    if (!isQuickDrawMode) {
      return;
    }

    const handleDetectionComplete = (event: Event) => {
      const customEvent = event as CustomEvent<{ overlayId: string }>;
      const { overlayId } = customEvent.detail;

      // Check if the completed overlay matches our current label
      if (
        currentLabel &&
        currentLabel.overlay?.id === overlayId &&
        !isSaving
      ) {
        // Auto-trigger save
        save();
      }
    };

    document.addEventListener("detection-complete", handleDetectionComplete);

    return () => {
      document.removeEventListener(
        "detection-complete",
        handleDetectionComplete
      );
    };
  }, [isQuickDrawMode, currentLabel, isSaving, save]);
};
