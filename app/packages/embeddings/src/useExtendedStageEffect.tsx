import { useEffect } from "react";
import {
  useReverbCallback,
  useReverbValue,
  useSetReverbState,
} from "@fiftyone/reverb";
import * as fos from "@fiftyone/state";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { fetchExtendedStage } from "./fetch";
import { atoms as selectionAtoms } from "./usePlotSelection";
import { usePointsField } from "./useBrainResult";
import { shouldResolveSelection } from "./utils";

export default function useExtendedStageEffect() {
  const datasetName = useReverbValue(fos.datasetName);
  const view = useReverbValue(fos.view);
  const [loadedPlot] = usePanelStatePartial("loadedPlot", null, true);
  const setOverrideStage = useSetReverbState(
    fos.extendedSelectionOverrideStage,
  );
  const { selection, spatialSelection } = useReverbValue(fos.extendedSelection);
  const getCurrentDataset = useReverbCallback(({ snapshot }) => async () => {
    return snapshot.getPromise(fos.datasetName);
  });
  const slices = useReverbValue(fos.currentSlices(false));
  const lassoPoints = useReverbValue(selectionAtoms.lassoPoints);
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
  }, [
    datasetName,
    loadedPlot?.patches_field,
    view,
    selection,
    pointsField,
    lassoPoints,
  ]);
}
