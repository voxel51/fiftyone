import * as foq from "@fiftyone/relay";
import { selector } from "recoil";

export const estimatedCounts =
  foq.graphQLSyncFragmentAtom<foq.estimatedCountsFragment$key>(
    {
      keys: ["dataset"],
      fragments: [foq.datasetFragment, foq.estimatedCounts],
    },
    {
      key: "estimatedCounts",
    }
  );

export const datasetSampleCount = selector({
  key: "datasetCount",
  get: ({ get }) => get(estimatedCounts).estimatedSampleCount,
});
