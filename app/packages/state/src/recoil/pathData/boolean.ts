import { selectorFamily } from "recoil";
import { aggregation } from "../aggregations";
import { queryPerformance } from "../queryPerformance";
import { lightningBooleanResults } from "./lightningBoolean";

export const booleanResults = selectorFamily<
  {
    count: number | null;
    results: { count: number | null; value: string | null }[];
  },
  { path: string; modal: boolean; extended: boolean }
>({
  key: "booleanResults",
  get:
    (params) =>
    ({ get }) => {
      if (get(queryPerformance)) {
        return get(lightningBooleanResults(params));
      }

      return get(booleanCountResults(params));
    },
});

export const booleanCountResults = selectorFamily({
  key: "booleanCountResults",
  get:
    (params: { path: string; modal: boolean; extended: boolean }) =>
    ({ get }) => {
      const data = get(aggregation(params));

      if (data.__typename !== "BooleanAggregation") {
        throw new Error("unexpected");
      }

      const result = {
        count: data.false + data.true,
        results: [
          { value: "False", count: data.false },
          { value: "True", count: data.true },
        ].filter(({ count }) => count),
      };

      return result;
    },
});
