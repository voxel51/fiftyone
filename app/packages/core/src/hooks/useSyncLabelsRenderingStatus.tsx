import { usePanelLoading } from "@fiftyone/spaces";
import {
  jotaiStore,
  numConcurrentRenderingLabels,
} from "@fiftyone/state/src/jotai";
import { useEffect } from "react";

/**
 * Hook to sync the rendering status of labels with the panel loading status.
 */
export const useSyncLabelsRenderingStatus = () => {
  const [_, setIsPanelUpdating] = usePanelLoading();

  useEffect(() => {
    // imavid playback toggles this count 0→1→0 many times a second; surface the indicator
    // only once rendering persists past a short delay, but clear it immediately at zero.
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    const clearShowTimer = () => {
      if (showTimer != null) {
        clearTimeout(showTimer);
        showTimer = null;
      }
    };

    const unsub = jotaiStore.sub(numConcurrentRenderingLabels, () => {
      const count = jotaiStore.get(numConcurrentRenderingLabels);
      if (count > 0) {
        if (showTimer == null) {
          showTimer = setTimeout(() => {
            showTimer = null;
            if (jotaiStore.get(numConcurrentRenderingLabels) > 0) {
              setIsPanelUpdating(true);
            }
          }, 250);
        }
      } else {
        clearShowTimer();
        setIsPanelUpdating(false);
      }
    });

    return () => {
      clearShowTimer();
      unsub();
    };
  }, [setIsPanelUpdating]);
};
