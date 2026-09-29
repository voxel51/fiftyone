import { useEffect, useState } from "react";
import { useReverbValue } from "@fiftyone/reverb";
import * as fos from "@fiftyone/state";
import { useBrainResult } from "./useBrainResult";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { fetchColorByChoices } from "./fetch";

export function useColorByChoices() {
  const datasetName = useReverbValue(fos.datasetName);
  const [brainKey] = useBrainResult();
  const view = useReverbValue(fos.view);
  const slices = useReverbValue(fos.currentSlices(false));
  const [loadedPlot] = usePanelStatePartial("loadedPlot", null, true);

  const [isLoading, setIsLoading] = useState(false);
  const [availableFields, setAvailableFields] = useState(null);

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
        .catch(() => {
          setIsLoading(false);
        });
    }
  }, [datasetName, brainKey, view, slices, loadedPlot?.patches_field]);
  return {
    availableFields,
    isLoading,
  };
}
