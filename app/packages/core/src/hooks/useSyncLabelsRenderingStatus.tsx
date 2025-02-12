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
    const unsub = jotaiStore.sub(numConcurrentRenderingLabels, () => {
      const count = jotaiStore.get(numConcurrentRenderingLabels);
      setIsPanelUpdating(count > 0);
    });

    return () => {
      unsub();
    };
  }, [setIsPanelUpdating]);
};
