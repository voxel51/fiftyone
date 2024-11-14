import { useFirstExistingUri, usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { useCallback } from "react";

const IS_OSS = true; // false in fiftyone-teams

export default function useComputeVisualization() {
  const { firstExistingUri: computeVisUri, exists: hasComputeVisualization } =
    useFirstExistingUri([
      "@voxel51/brain/compute_visualization",
      "@voxel51/operators/compute_visualization",
    ]);

  const panelId = usePanelId();
  const triggerEvent = usePanelEvent();

  const prompt = useCallback(() => {
    triggerEvent(panelId, {
      params: { delegate: true },
      operator: computeVisUri,
      prompt: true,
    });
  }, [panelId, triggerEvent, computeVisUri]);

  return {
    isAvailable: IS_OSS ? false : hasComputeVisualization,
    prompt,
  };
}
