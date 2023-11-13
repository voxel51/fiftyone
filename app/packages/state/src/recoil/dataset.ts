import * as foq from "@fiftyone/relay";
import { selector } from "recoil";

const estimatedCounts =
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
  key: "datasetSampleCount",
  get: ({ get }) => get(estimatedCounts).estimatedSampleCount,
});

export const datasetFrameCount = selector({
  key: "datasetFrameCount",
  get: ({ get }) => get(estimatedCounts).estimatedFrameCount,
});
