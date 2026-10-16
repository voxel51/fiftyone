import * as fos from "@fiftyone/state";
import { useCallback, useEffect } from "react";
import { useRecoilState, useRecoilValue } from "recoil";

export default function useSchemaSettings() {
  const datasetName = useRecoilValue(fos.datasetName) as string;
  const isFieldVisibilityActive = useRecoilValue(fos.isFieldVisibilityActive);
  const fieldVisibilityStage = useRecoilValue(fos.fieldVisibilityStage);
  const affectedPathCount =
    fieldVisibilityStage?.kwargs?.field_names?.length || 0;

  const [excludedPaths, setExcludedPaths] = useRecoilState(
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
