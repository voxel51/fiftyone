import * as foq from "@fiftyone/relay";
import { selector } from "recoil";
import { transformDataset } from "../utils";
import { State } from "./types";

export const dataset = foq.graphQLSyncFragmentAtom<
  foq.datasetFragment$key,
  State.Dataset | null
>(
  {
    fragments: [foq.datasetFragment],
    keys: ["dataset"],
    read: (dataset) => {
      return { ...transformDataset(dataset) };
    },
    default: null,
  },
  {
    key: "dataset",
  }
);

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
