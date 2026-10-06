import { useEffect } from "react";
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from "recoil";
import * as fos from "@fiftyone/state";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { fetchExtendedStage } from "./fetch";
import { atoms as selectionAtoms } from "./usePlotSelection";
import { usePointsField } from "./useBrainResult";
import { shouldResolveSelection } from "./utils";

export default function useExtendedStageEffect() {
  const datasetName = useRecoilValue(fos.datasetName);
  const view = useRecoilValue(fos.view);
  const [loadedPlot] = usePanelStatePartial("loadedPlot", null, true);
  const setOverrideStage = useSetRecoilState(
    fos.extendedSelectionOverrideStage,
  );
  const { selection, spatialSelection } = useRecoilValue(fos.extendedSelection);
  const getCurrentDataset = useRecoilCallback(({ snapshot }) => async () => {
    return snapshot.getPromise(fos.datasetName);
  });
  const slices = useRecoilValue(fos.currentSlices(false));
  const lassoPoints = useRecoilValue(selectionAtoms.lassoPoints);
  const [pointsField] = usePointsField();

  useEffect(() => {
    if (loadedPlot && Array.isArray(selection)) {
      const shouldIncludeSelection = shouldResolveSelection(
        view,
        null,
        loadedPlot.patches_field,
        pointsField,
      );
      fetchExtendedStage({
        datasetName,
        view,
        patchesField: loadedPlot.patches_field,
        selection: shouldIncludeSelection ? selection : null,
        slices,
        lassoPoints,
        pointsField,
      }).then(async (res) => {
        const currentDataset = await getCurrentDataset();
        if (currentDataset !== datasetName) return;
        if (spatialSelection) {
          return;
        }
        setOverrideStage({
          [res._cls]: res.kwargs,
        });
      });
    }
    // refetch on these inputs only; slices, the spatial selection and the plot
    // object are read at fetch time
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [
    datasetName,
    loadedPlot?.patches_field,
    view,
    selection,
    pointsField,
    lassoPoints,
  ]);
}
