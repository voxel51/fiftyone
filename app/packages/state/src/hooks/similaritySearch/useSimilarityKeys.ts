import { useMemo } from "react";
import { useReverbValue } from "@fiftyone/reverb";
import * as fos from "@fiftyone/state";

/**
 * Brain keys of all of the dataset's similarity indexes, for surfaces that
 * pick a `brain_key` — e.g. a `SortBySimilarity` stage form. Sorted for a
 * stable list.
 */
const useSimilarityKeys = (): string[] => {
  const { samples, patches } = useReverbValue(fos.similarityMethods);
  return useMemo(
    () =>
      [
        ...samples.map(({ key }) => key),
        ...patches.map(([method]) => method.key),
      ].sort(),
    [samples, patches],
  );
};

export default useSimilarityKeys;
