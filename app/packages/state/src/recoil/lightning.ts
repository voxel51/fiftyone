import * as foq from "@fiftyone/relay";
import { selector, selectorFamily } from "recoil";
import { graphQLSelectorFamily } from "recoil-relay";
import { ResponseFrom } from "../utils";
import { config } from "./config";
import { RelayEnvironmentKey } from "./relay";
import * as schemaAtoms from "./schema";
import { datasetName } from "./selectors";

export const lightningQuery = graphQLSelectorFamily<
  foq.lightningQuery$variables,
  foq.LightningInput["paths"],
  ResponseFrom<foq.lightningQuery>["lightning"]
>({
  environment: RelayEnvironmentKey,
  key: "lightningQuery",
  query: foq.lightning,
  mapResponse: (response) => response.lightning,
  variables:
    (paths) =>
    ({ get }) => {
      return {
        input: {
          dataset: get(datasetName),
          paths,
        },
      };
    },
});

export const lightningStringResults = selectorFamily<
  [string | null, null][],
  { path: string; search?: string; exclude?: string[] }
>({
  key: "lightningStringResults",
  get:
    (params) =>
    ({ get }) => {
      const [data] = get(lightningQuery([{ ...params, first: 25 }]));

      if (data.__typename !== "StringLightningResult") {
        throw new Error("bad");
      }

      return data.values.map((v) => [v, null]);
    },
});

const indexes = foq.graphQLSyncFragmentAtom<foq.indexesFragment$key>(
  {
    keys: ["dataset"],
    fragments: [foq.datasetFragment, foq.indexesFragment],
  },
  {
    key: "lightningSampleFields",
  }
);

const indexesByPath = selector({
  key: "indexesByPath",
  get: ({ get }) => {
    return new Set(
      get(indexes).sampleIndexes.map(({ key: [{ field }] }) => {
        return field;
      })
    );
  },
});

export const pathIndex = selectorFamily({
  key: "pathIndex",
  get:
    (path: string) =>
    ({ get }) =>
      get(indexesByPath).has(get(schemaAtoms.dbPath(path))),
});

export const pathIsLocked = selectorFamily({
  key: "pathIsLocked",
  get:
    (path: string) =>
    ({ get }) => {
      return !get(pathIndex(path));
    },
});

export const lightningPath = selectorFamily({
  key: "lightningPath",
  get:
    (path: string) =>
    ({ get }) => {
      return get(lightningQuery(get(schemaAtoms.filterFields(path)))).filter(
        (data) => data.path === path
      )[0];
    },
});

const lightningThreshold = selector({
  key: "lightningThreshold",
  get: ({ get }) => get(config).lightningThreshold,
});

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

export const lightning = selector({
  key: "lightning",
  get: ({ get }) => {
    const { estimatedFrameCount, estimatedSampleCount } = get(estimatedCounts);
    const threshold = get(lightningThreshold);

    return (
      estimatedFrameCount >= threshold || estimatedSampleCount >= threshold
    );
  },
});

export const isLightningPath = selectorFamily({
  key: "isLightningPath",
  get:
    (path: string) =>
    ({ get }) => {
      return get(lightning) && !get(pathIsLocked(path));
    },
});
