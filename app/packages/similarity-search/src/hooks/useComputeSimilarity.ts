import { useFirstExistingUri, usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { constants } from "@fiftyone/utilities";
import { useCallback } from "react";
import { COMPUTE_SIMILARITY_URI } from "../constants";

export default function useComputeSimilarity() {
  const { firstExistingUri: computeSimUri, exists: hasComputeSimilarity } =
    useFirstExistingUri([COMPUTE_SIMILARITY_URI]);

  const panelId = usePanelId();
  const triggerEvent = usePanelEvent();

  const prompt = useCallback(() => {
    triggerEvent(panelId, {
      params: { delegate: true },
      operator: computeSimUri,
      prompt: true,
    });
  }, [panelId, triggerEvent, computeSimUri]);

  return {
    isAvailable: constants.IS_APP_MODE_FIFTYONE ? false : hasComputeSimilarity,
    prompt,
  };
}
