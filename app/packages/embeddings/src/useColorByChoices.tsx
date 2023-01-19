import { useEffect, useState } from "react";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { useBrainResult } from "./useBrainResult";
import { fetchColorByChoices } from "./fetch";

export function useColorByChoices() {
  const datasetName = useRecoilValue(fos.datasetName);
  const [brainKey] = useBrainResult();
  const [isLoading, setIsLoading] = useState(false);
  const [availableFields, setAvailableFields] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (brainKey) {
      setIsLoading(true);
      fetchColorByChoices({ datasetName, brainKey })
        .then((r) => {
          setIsLoading(false);
          setAvailableFields(["uncolored", ...r.fields]);
        })
        .catch((e) => {
          setIsLoading(false);
          setError(e);
        });
    }
  }, [datasetName, brainKey]);

  return {
    availableFields,
    isLoading,
  };
}
