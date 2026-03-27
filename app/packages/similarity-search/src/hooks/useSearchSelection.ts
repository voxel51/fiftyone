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
      return Array.from(selectedSamples);
    }
    return [];
  }, [selectedSamples, selectedLabels]);

  const hasView = Array.isArray(view) && view.length > 0;

  return {
    selectedSamples,
    selectedLabels,
    view,
    hasSamplesSelected,
    queryIds,
    hasView,
  };
};
