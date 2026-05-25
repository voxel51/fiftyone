import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";

/**
 * Hook that reads FiftyOne selection state (samples + labels)
 * and derives query IDs for image-based similarity search.
 */
export const useSearchSelection = () => {
  const selectedSamples = useRecoilValue(fos.selectedSamples);
  const selectedLabels = useRecoilValue(fos.selectedLabels);
  const view = useRecoilValue(fos.view);

  const hasSamplesSelected = useMemo(
    () =>
      (selectedLabels && selectedLabels.length > 0) ||
      (selectedSamples && selectedSamples.size > 0),
    [selectedSamples, selectedLabels]
  );

  const queryIds = useMemo(() => {
    if (selectedLabels && selectedLabels.length > 0) {
      return selectedLabels.map((l: { label_id: string }) => l.label_id);
    }
    if (selectedSamples && selectedSamples.size > 0) {
      // Only include "default" (positive) selections as query IDs
      return Array.from(selectedSamples.entries())
        .filter(([, type]) => type === "default")
        .map(([id]) => id);
    }
    return [];
  }, [selectedSamples, selectedLabels]);

  const negativeQueryIds = useMemo(() => {
    if (selectedSamples && selectedSamples.size > 0) {
      return Array.from(selectedSamples.entries())
        .filter(([, type]) => type === "alt")
        .map(([id]) => id);
    }
    return [];
  }, [selectedSamples]);

  const hasView = Array.isArray(view) && view.length > 0;

  return {
    selectedSamples,
    selectedLabels,
    view,
    hasSamplesSelected,
    queryIds,
    negativeQueryIds,
    hasView,
  };
};
