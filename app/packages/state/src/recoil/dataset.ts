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
  },
);

/**
 * Where each media source the browser addresses by path is, by source id.
 * Read once per dataset load; a sample's assets name their source, so nothing
 * repeats a location per page.
 */
export const mediaSources = selector<Readonly<Record<string, string>> | null>({
  key: "mediaSources",
  get: ({ get }) => get(dataset)?.mediaSources ?? null,
});

const estimatedCounts =
  foq.graphQLSyncFragmentAtom<foq.estimatedCountsFragment$key>(
    {
      keys: ["dataset"],
      fragments: [foq.datasetFragment, foq.estimatedCounts],
    },
    {
      key: "estimatedCounts",
    },
  );

export const datasetSampleCount = selector<number | null>({
  key: "datasetSampleCount",
  get: ({ get }) => get(estimatedCounts)?.estimatedSampleCount ?? null,
});

export const datasetFrameCount = selector<number | null>({
  key: "datasetFrameCount",
  get: ({ get }) => get(estimatedCounts)?.estimatedFrameCount ?? null,
});
