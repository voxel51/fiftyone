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
    let animationId: ReturnType<typeof requestAnimationFrame>;

    const sync = () => {
      animationId = requestAnimationFrame(sync);

      const count = jotaiStore.get(numConcurrentRenderingLabels);

      if (count > 0) {
        setIsPanelUpdating(true);
      } else {
        setIsPanelUpdating(false);
      }
    };

    animationId = requestAnimationFrame(sync);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [setIsPanelUpdating]);
};
