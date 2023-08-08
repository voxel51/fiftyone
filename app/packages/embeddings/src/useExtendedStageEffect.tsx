import { useEffect } from "react";
import { useRecoilCallback, useRecoilValue, useSetRecoilState } from "recoil";
import * as fos from "@fiftyone/state";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { fetchExtendedStage } from "./fetch";

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
  const slices = fos.currentSlices(false);

  useEffect(() => {
    if (loadedPlot && Array.isArray(selection)) {
      fetchExtendedStage({
        datasetName,
        view,
        patchesField: loadedPlot.patches_field,
        selection,
        slices,
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
