import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { useBrainResult } from "./useBrainResult";
import { fetchUpdatedSelection } from "./fetch";
import { usePlotSelection } from "./usePlotSelection";

export function useSelectionEffect() {
  const { setPlotSelection } = usePlotSelection();
  const datasetName = useRecoilValue(fos.datasetName);
  const selectedSamples = useRecoilValue(fos.selectedSamples);
  const [brainKey] = useBrainResult();
  const view = useRecoilValue(fos.view);
  const [loadedPlot] = usePanelStatePartial("loadedPlot", null, true);
  const filters = useRecoilValue(fos.filters);
  const extended = useRecoilValue(fos.extendedStagesUnsorted);
  const { selection } = useRecoilValue(fos.extendedSelection);
  const slices = fos.currentSlices(false);

  // updated the selection when the extended view updates
  useEffect(() => {
    if (loadedPlot) {
      const resolvedExtended = selection ? extended : null;
      fetchUpdatedSelection({
        datasetName,
        brainKey,
        view,
        filters,
        extended: resolvedExtended,
        extendedSelection: selection,
        slices,
      }).then((res) => {
        let resolved = null;
        if (res.selected) {
          resolved = res.selected;
        } else if (selectedSamples && selectedSamples.size) {
          resolved = Array.from(selectedSamples);
        }
        setPlotSelection(resolved);
      });
    }
  }, [datasetName, brainKey, view, filters, selection, selectedSamples]);
}
