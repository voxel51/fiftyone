import { useEffect, useState } from "react";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { useBrainResult } from "./useBrainResult";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { fetchColorByChoices } from "./fetch";

export function useColorByChoices() {
  const datasetName = useRecoilValue(fos.datasetName);
  const [brainKey] = useBrainResult();
  const view = useRecoilValue(fos.view);
  const slices = useRecoilValue(fos.currentSlices(false));
  const [loadedPlot] = usePanelStatePartial("loadedPlot", null, true);

  const [isLoading, setIsLoading] = useState(false);
  const [availableFields, setAvailableFields] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (loadedPlot && brainKey) {
      setIsLoading(true);
      fetchColorByChoices({
        datasetName,
        view,
        slices,
        patchesField: loadedPlot.patches_field,
      })
        .then((r) => {
          setIsLoading(false);
          setAvailableFields(["uncolored", ...r.fields]);
        })
        .catch((e) => {
          setIsLoading(false);
          setError(e);
        });
    }
  }, [datasetName, brainKey, view, slices, loadedPlot?.patches_field]);
  return {
    availableFields,
    isLoading,
  };
}
