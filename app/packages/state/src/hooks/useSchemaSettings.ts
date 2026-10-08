import * as fos from "@fiftyone/state";
import { useCallback, useEffect } from "react";
import { useReverbState, useReverbValue } from "@fiftyone/reverb";

export default function useSchemaSettings() {
  const datasetName = useReverbValue(fos.datasetName) as string;
  const isFieldVisibilityActive = useReverbValue(fos.isFieldVisibilityActive);
  const fieldVisibilityStage = useReverbValue(fos.fieldVisibilityStage);
  const affectedPathCount =
    fieldVisibilityStage?.kwargs?.field_names?.length || 0;

  const [excludedPaths, setExcludedPaths] = useReverbState(
    fos.excludedPathsState({}),
  );

  useEffect(() => {
    if (datasetName && !excludedPaths?.[datasetName]) {
      setExcludedPaths({ [datasetName]: new Set() });
    }
  }, [datasetName, excludedPaths, setExcludedPaths]);

  const resetExcludedPaths = useCallback(() => {
    setExcludedPaths({ [datasetName]: new Set() });
  }, [setExcludedPaths, datasetName]);

  return {
    affectedPathCount,
    isFieldVisibilityActive,
    resetExcludedPaths,
  };
}
