import * as foq from "@fiftyone/relay";
import { atom, selectorFamily } from "recoil";
import { graphQLSelectorFamily } from "recoil-relay";
import { ResponseFrom } from "../utils";
import { RelayEnvironmentKey } from "./relay";
import * as schemaAtoms from "./schema";
import { datasetName } from "./selectors";

const lightningQuery = graphQLSelectorFamily<
  foq.lightningQuery$variables,
  string[],
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
          paths: paths.map((path) => ({
            path,
          })),
        },
      };
    },
});

export const lightningSampleFields = foq.graphQLSyncFragmentAtom(
  {
    keys: ["dataset"],
    fragments: [foq.datasetFragment, foq.indexesFragment],
    default: [],
  },
  {
    key: "lightningSampleFields",
  }
);

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
