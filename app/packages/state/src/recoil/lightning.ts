import * as foq from "@fiftyone/relay";
import { atom, selector, selectorFamily } from "recoil";
import { graphQLSelectorFamily } from "recoil-relay";
import { ResponseFrom } from "../utils";
import { RelayEnvironmentKey } from "./relay";
import * as schemaAtoms from "./schema";
import { datasetName } from "./selectors";

const lightningQuery = graphQLSelectorFamily<
  foq.lightningQuery$variables,
  { path: string; search?: string; exclude?: string[]; first }[],
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

const indexesByField = selector({
  key: "indexesByField",
  get: ({ get }) => {
    return new Set(
      get(indexes).sampleIndexes.map(({ key: [{ field }] }) => {
        return field;
      })
    );
  },
});

export const fieldIndex = selectorFamily({
  key: "fieldIndex",
  get:
    (field: string) =>
    ({ get }) =>
      get(indexesByField).has(field),
});

export const fieldIsLocked = selectorFamily({
  key: "fieldIsLocked",
  get:
    (field: string) =>
    ({ get }) => {
      return !get(fieldIndex(field));
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

export const lightning = atom({
  key: "lightning",
  default: true,
});
