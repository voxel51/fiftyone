import * as foq from "@fiftyone/relay";

export const mediaFields = foq.graphQLSyncFragmentAtom<
  foq.mediaFieldsFragment$key,
  string[]
>(
  {
    fragments: [foq.datasetFragment, foq.mediaFieldsFragment],
    keys: ["dataset"],
    read: (data) => {
      const paths = new Set(data.sampleFields.map(({ path }) => path));
      return data.appConfig.mediaFields.filter((path) => paths.has(path));
    },
  },
  {
    key: "mediaFields",
  }
);
