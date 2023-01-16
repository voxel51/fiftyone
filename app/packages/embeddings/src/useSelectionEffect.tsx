import { useEffect } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { useBrainResult } from "./useBrainResult";
import { useColorByField } from "./useLabelSelector";
import { useWarnings } from "./useWarnings";
import { fetchUpdatedSelection } from "./fetch";
import { usePlotSelection } from "./usePlotSelection";

export function useSelectionEffect() {
  const { setPlotSelection } = usePlotSelection();
  const datasetName = useRecoilValue(fos.datasetName);
  const [selectedSamples, setSelectedSamples] = useRecoilState(
    fos.selectedSamples
  );
  const [brainKey] = useBrainResult();
  const [labelField] = useColorByField();
  const view = useRecoilValue(fos.view);
  const [loadedPlot, setLoadedPlot] = usePanelStatePartial(
    "loadedPlot",
    null,
    true
  );
  const [loadingPlot, setLoadingPlot] = usePanelStatePartial(
    "loadingPlot",
    true
  );
  const [loadingPlotError, setLoadingPlotError] = usePanelStatePartial(
    "loadingPlotError",
    null
  );
  const filters = useRecoilValue(fos.filters);
  const extended = useRecoilValue(fos.extendedStagesUnsorted);
  const [overrideStage, setOverrideStage] = useRecoilState(
    fos.extendedSelectionOverrideStage
  );
  const [extendedSelection, setExtendedSelection] = useRecoilState(
    fos.extendedSelection
  );
  const warnings = useWarnings();

  // updated the selection when the extended view updates
  useEffect(() => {
    if (loadedPlot) {
      const resolvedExtended = extendedSelection ? extended : null;
      fetchUpdatedSelection({
        datasetName,
        brainKey,
        view,
        filters,
        extended: resolvedExtended,
        extendedSelection,
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
  }, [
    datasetName,
    brainKey,
    view,
    filters,
    extendedSelection,
    selectedSamples,
  ]);
}
