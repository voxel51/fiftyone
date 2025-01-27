import { useEffect } from "react";
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from "recoil";
import * as fos from "@fiftyone/state";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { fetchExtendedStage } from "./fetch";
import { atoms as selectionAtoms } from "./usePlotSelection";
import useCurrentPlotWindow from "./useCurrentPlotWindow";

export default function useExtendedStageEffect() {
  const datasetName = useRecoilValue(fos.datasetName);
  const view = useRecoilValue(fos.view);
  const [loadedPlot] = usePanelStatePartial("loadedPlot", null, true);
  const setOverrideStage = useSetRecoilState(
    fos.extendedSelectionOverrideStage
  );
  const { selection } = useRecoilValue(fos.extendedSelection);
  const getCurrentDataset = useRecoilCallback(({ snapshot }) => async () => {
    return snapshot.getPromise(fos.datasetName);
  });
  const slices = useRecoilValue(fos.currentSlices(false));
  const lassoPoints = useRecoilValue(selectionAtoms.lassoPoints);
  const currentPlotWindow = useCurrentPlotWindow();

  useEffect(() => {
    if (loadedPlot && Array.isArray(selection)) {
      fetchExtendedStage({
        datasetName,
        view,
        patchesField: loadedPlot.patches_field,
        selection,
        slices,
        lassoPoints,
        plotBounds: currentPlotWindow.bounds,
      }).then(async (res) => {
        const currentDataset = await getCurrentDataset();
        if (currentDataset !== datasetName) return;
        setOverrideStage({
          [res._cls]: res.kwargs,
        });
      });
    }
  }, [datasetName, loadedPlot?.patches_field, view, selection]);
}
