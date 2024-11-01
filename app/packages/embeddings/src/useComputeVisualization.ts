import { useCallback, useMemo } from "react";
import { listLocalAndRemoteOperators } from "@fiftyone/operators/src/operators";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";

const IS_OSS = true; // false in fiftyone-teams

const useFirstExistingUri = (uris: string[]) => {
  const availableOperators = useMemo(() => listLocalAndRemoteOperators(), []);
  return useMemo(() => {
    const existingUri = uris.find((uri) =>
      availableOperators.allOperators.some((op) => op.uri === uri)
    );
    const exists = Boolean(existingUri);
    return { firstExistingUri: existingUri, exists };
  }, [availableOperators, uris]);
};

export default function useComputeVisualization() {
  let { firstExistingUri: computeVisUri, exists: hasComputeVisualization } =
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
