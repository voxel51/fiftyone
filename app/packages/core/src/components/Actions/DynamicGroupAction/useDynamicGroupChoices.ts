import * as fos from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import { useEffect, useState } from "react";
import { useRecoilValue } from "recoil";

export function useDynamicGroupChoices() {
  const datasetName = useRecoilValue(fos.datasetName);
  const [isLoading, setIsLoading] = useState(false);
  const [availableFields, setAvailableFields] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const res = await getFetchFunction()<
          { datasetName: string },
          { fields: string[] }
        >("POST", "dynamic-groups/field-choices", { datasetName });
        if (!res.fields) throw new Error("No fields returned");
        setAvailableFields(res.fields);
      } catch (e) {
        setError(`Failed to fetch field choices: ${e}`);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [datasetName]);

  return {
    availableFields,
    isLoading,
    error,
  };
}
