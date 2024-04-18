import * as foq from "@fiftyone/relay";

export const datasetHeadName = foq.graphQLSyncFragmentAtom<
  foq.snapshotFragment$key,
  string | null
>(
  {
    fragments: [foq.datasetFragment, foq.snapshotFragment],
    keys: ["dataset"],
    read: (dataset) => {
      return dataset.headName;
    },
    default: null,
  },
  {
    key: "datasetHeadName",
  }
);

export const datasetSnapshotName = foq.graphQLSyncFragmentAtom<
  foq.snapshotFragment$key,
  string | null
>(
  {
    fragments: [foq.datasetFragment, foq.snapshotFragment],
    keys: ["dataset"],
    read: (dataset) => {
      return dataset.snapshotName;
    },
    default: null,
  },
  {
    key: "datasetSnapshotName",
  }
);
