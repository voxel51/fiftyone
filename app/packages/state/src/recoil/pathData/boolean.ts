import { selectorFamily } from "recoil";
import { aggregation } from "../aggregations";
import { noneCount } from "./counts";

export const booleanCountResults = selectorFamily({
  key: "booleanCountResults",
  get:
    (params: { path: string; modal: boolean; extended: boolean }) =>
    ({ get }) => {
      const data = get(aggregation(params));
      const none = get(noneCount(params));

      if (data.__typename !== "BooleanAggregation") {
        throw new Error("unexpected");
      }

      const result = {
        count: data.false + data.true,
        results: [
          { value: "False", count: data.false },
          { value: "True", count: data.true },
        ],
      };
      if (none) {
        result.results.push({ value: null, count: none });
      }
      return result;
    },
});
