import { useEffect } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { useBrainResult } from "./useBrainResult";
import { useColorByField } from "./useLabelSelector";
import { useWarnings } from "./useWarnings";
import { fetchPlot } from "./fetch";

export function useViewChangeEffect() {
  const colorSeed = useRecoilValue(fos.colorSeed(false));
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
    true,
    true
  );
  const [loadingPlotError, setLoadingPlotError] = usePanelStatePartial(
    "loadingPlotError",
    null,
    true
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

  useEffect(() => {
    setOverrideStage(null);
    setLoadingPlot(true);
    fetchPlot({ datasetName, brainKey, view, labelField })
      .catch((err) => setLoadingPlotError(err))
      .then((res) => {
        const notUsed = res.index_size - res.available_count;
        const missing = res.missing_count;
        const total = res.index_size;
        const type = res.patches_field ? "patches" : "samples";

        warnings.clear();

        if (missing > 0) {
          warnings.add(
            `${missing} ${type} in the current view do not have corresponding embeddings.`
          );
        }

        if (notUsed > 0) {
          warnings.add(
            `${notUsed} embeddings in the index correspond to samples not in the current view`
          );
        }

        setLoadingPlotError(null);
        setLoadedPlot(res);
      })
      .finally(() => setLoadingPlot(false));
  }, [datasetName, brainKey, labelField, view, colorSeed]);
}
