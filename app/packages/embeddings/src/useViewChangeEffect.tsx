import { useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import * as fos from "@fiftyone/state";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { useBrainResult } from "./useBrainResult";
import { useColorByField } from "./useLabelSelector";
import { useWarnings } from "./useWarnings";
import { fetchPlot } from "./fetch";

export function useViewChangeEffect() {
  const colorSeed = useRecoilValue(fos.colorSeed);
  const datasetName = useRecoilValue(fos.datasetName);
  const [brainKey, setBrainKey] = useBrainResult();
  const [labelField] = useColorByField();
  const view = useRecoilValue(fos.view);
  const slices = useRecoilValue(fos.currentSlices(false));
  const filters = useRecoilValue(fos.filters);
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
  const setOverrideStage = useSetRecoilState(
    fos.extendedSelectionOverrideStage
  );
  const warnings = useWarnings();

  useEffect(() => {
    setOverrideStage(null);
    setLoadingPlot(true);
    fetchPlot({ datasetName, filters, brainKey, view, labelField, slices })
      .catch((err) => {
        setLoadingPlotError(err);
        // setBrainKey(null);
      })
      .then((res) => {
        if (!res || !res.index_size) {
          if (res?.index_size === 0) {
            warnings.add(`No samples in the current view.`);
          }
          return;
        }

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
  }, [datasetName, brainKey, labelField, view, colorSeed, slices, filters]);
}
