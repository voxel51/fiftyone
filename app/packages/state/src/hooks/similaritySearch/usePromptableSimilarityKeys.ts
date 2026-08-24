import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";

/**
 * Brain keys of sample-level similarity indexes that accept text prompts,
 * for surfaces that turn a typed query into a `SortBySimilarity` stage.
 * Sorted so "the first key" is stable across sessions.
 */
const usePromptableSimilarityKeys = (): string[] => {
  const { samples } = useRecoilValue(fos.similarityMethods);
  return useMemo(
    () =>
      samples
        .filter((method) => method.supportsPrompts === true)
        .map(({ key }) => key)
        .sort(),
    [samples],
  );
};

export default usePromptableSimilarityKeys;
