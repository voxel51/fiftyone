import { useEffect } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { useBrainResult } from "./useBrainResult";
import { useColorByField } from "./useLabelSelector";
import { useWarnings } from "./useWarnings";
import { fetchUpdatedSelection, fetchExtendedStage } from "./fetch";
import { handleInitialPlotLoad } from "./handleInitialPlotLoad";

export function useLoadedPlot({ clearSelection, setPlotSelection }) {
  const datasetName = useRecoilValue(fos.datasetName);
  const [selectedSamples, setSelectedSamples] = useRecoilState(
    fos.selectedSamples
  );
  const [brainKey] = useBrainResult();
  const [labelField] = useColorByField();
  const view = useRecoilValue(fos.view);
  const [loadedPlot, setLoadedPlot] = usePanelStatePartial("loadedPlot", null);
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

  // build the initial plot on load
  useEffect(() => {
    console.log("initial load");
    clearSelection();
    setOverrideStage(null);
    setLoadingPlot(true);
    handleInitialPlotLoad({ datasetName, brainKey, view, labelField })
      .catch((err) => setLoadingPlotError(err))
      .then((res) => {
        console.log(res);
        const notUsed = res.index_size - res.available_count;
        const missing = res.missing_count;
        const total = res.index_size;
        const type = res.patches_field ? "patches" : "samples";

        warnings.clear();

        if (missing > 0) {
          warnings.add(
            `${missing} ${type} are included in the current view but do not have corresponding embeddings.`
          );
        }

        if (notUsed > 0) {
          warnings.add(
            `Not all embeddings are used in the current view. ${notUsed} embeddings are not used.`
          );
        }

        setLoadingPlotError(null);
        setPlotSelection(res.selected_ids);
        setLoadedPlot(res);
      })
      .finally(() => setLoadingPlot(false));
  }, [datasetName, brainKey, labelField]);

  // updated the selection when the extended view updates
  useEffect(() => {
    console.log("updated the selection when the extended view updates", {
      view,
      extended,
      filters,
      extendedSelection,
    });

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
        const resolved =
          res.selected || selectedSamples ? Array.from(selectedSamples) : null;
        console.log("setting plot selection to", resolved);
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

  // update the extended stages based on the current view
  useEffect(() => {
    if (loadedPlot && Array.isArray(extendedSelection)) {
      fetchExtendedStage({
        datasetName,
        view,
        patchesField: loadedPlot.patches_field,
        selection: extendedSelection,
      }).then((res) => {
        setOverrideStage({
          [res._cls]: res.kwargs,
        });
      });
    }
  }, [datasetName, loadedPlot?.patches_field, view, extendedSelection]);
  return {
    ...(loadedPlot || {}),
    isLoading: loadingPlot,
    error: loadingPlotError,
  };
}
