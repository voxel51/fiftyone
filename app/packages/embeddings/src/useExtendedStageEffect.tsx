import { useEffect } from "react";
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from "recoil";
import * as fos from "@fiftyone/state";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { fetchExtendedStage } from "./fetch";
import { atoms as selectionAtoms } from "./usePlotSelection";
import { usePointsField } from "./useBrainResult";

export default function useExtendedStageEffect() {
  const datasetName = useRecoilValue(fos.datasetName);
  const view = useRecoilValue(fos.view);
  const [loadedPlot] = usePanelStatePartial("loadedPlot", null, true);
  const setOverrideStage = useSetRecoilState(
    fos.extendedSelectionOverrideStage
  );
  // const { selection } = useRecoilValue(fos.extendedSelection);
  // const [plotSelection, setPlotSelection] = usePanelStatePartial(
  //   "plotSelection",
  //   [],
  //   true
  // );
  const plotSelection = useRecoilValue(selectionAtoms.plotSelection);
  const getCurrentDataset = useRecoilCallback(({ snapshot }) => async () => {
    return snapshot.getPromise(fos.datasetName);
  });
  const slices = useRecoilValue(fos.currentSlices(false));
  const lassoPoints = useRecoilValue(selectionAtoms.lassoPoints);
  const [pointsField] = usePointsField();

  useEffect(() => {
    if (pointsField && !hasLassoPoints(lassoPoints)) return;
    if (loadedPlot && Array.isArray(plotSelection)) {
      fetchExtendedStage({
        datasetName,
        view,
        patchesField: loadedPlot.patches_field,
        selection: lassoPoints ? null : plotSelection,
        slices,
        lassoPoints,
        pointsField,
      }).then(async (res) => {
        const currentDataset = await getCurrentDataset();
        if (currentDataset !== datasetName) return;
        setOverrideStage({
          [res._cls]: res.kwargs,
        });
      });
    }
  }, [
    datasetName,
    loadedPlot?.patches_field,
    view,
    plotSelection,
    pointsField,
    lassoPoints,
  ]);
}

function hasLassoPoints(lasooPoints) {
  return lasooPoints.x.length > 0 && lasooPoints.y.length > 0;
}
