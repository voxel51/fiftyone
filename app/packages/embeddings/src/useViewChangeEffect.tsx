import { usePanelStatePartial } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { fetchPlot } from "./fetch";
import { useBrainResult, usePointsField } from "./useBrainResult";
import { useColorByField } from "./useLabelSelector";
import { useWarnings } from "./useWarnings";
import { PlotErrorResponse, PlotResponse, PlotSuccessResponse } from "./types";
import { NetworkError } from "@fiftyone/utilities";



export function useViewChangeEffect() {
  const colorSeed = useRecoilValue(fos.colorSeed);
  const datasetName = useRecoilValue(fos.datasetName);
  const [brainKey, setBrainKey] = useBrainResult();
  const [pointsField, setPointsField] = usePointsField();
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
    fetchPlot({ datasetName, brainKey, view, labelField, slices })
      .catch((err: Error) => {
        if (err instanceof NetworkError) {
          setLoadingPlotError({
            message: "Network Error",
            stack: [
              err.stack,
              "See console for network error details."
            ].join("\n"),
          });
        } else {
          setLoadingPlotError({
            message: err.message,
            stack: err.stack,
          });
        }
      })
      .then((res: PlotResponse) => {
        warnings.clear();

        if (!res) return;

        if ('error' in res && res.error) {
          res = res as PlotErrorResponse;
          setLoadingPlotError({
            message: res.error,
            details: res.details,
            stack: res.stack,
          });
          return;
        }

        res = res as PlotSuccessResponse;

        if (!res || !res.index_size) {
          if (res?.index_size === 0) {
            warnings.add(`No samples in the current view.`);
          }
          return;
        }

        const notUsed = res.index_size - res.available_count;
        const missing = res.missing_count;
        const type = res.patches_field ? "patches" : "samples";

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
        setPointsField(res.points_field);
      })
      .finally(() => setLoadingPlot(false));
  }, [datasetName, brainKey, labelField, view, colorSeed, slices, filters]);
}
