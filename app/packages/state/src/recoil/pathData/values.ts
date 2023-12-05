import { selectorFamily } from "recoil";
import { aggregation } from "../aggregations";
import { gatherPaths } from "./utils";

export const values = selectorFamily<
  string[],
  { extended: boolean; path: string; modal: boolean }
>({
  key: "values",
  get:
    (params) =>
    ({ get }) => {
      if (params) {
        const result = get(aggregation(params));
        if (result.__typename !== "StringAggregation") {
          throw new Error("unexpected");
        }

        if (result && result.values) {
          return result.values.map(({ value }) => value).sort() || [];
        }
      }
      return [];
    },
});

export const cumulativeValues = selectorFamily<
  string[],
  {
    extended: boolean;
    path: string;
    modal: boolean;
    ftype: string | string[];
    embeddedDocType?: string | string[];
  }
>({
  key: "cumulativeValues",
  get:
    ({ extended, path: key, modal, ftype, embeddedDocType }) =>
    ({ get }) => {
      return Array.from(
        new Set<string>(
          gatherPaths(get, ftype, embeddedDocType).reduce(
            (result, path) => [
              ...result,
              ...get(values({ extended, modal, path: `${path}.${key}` })),
            ],
            []
          )
        )
      ).sort();
    },
});
