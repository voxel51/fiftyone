import { selectorFamily } from "recoil";
import { aggregation } from "../aggregations";
import { isLightningPath, lightning } from "../lightning";
import { noneCount } from "./counts";
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
      if (get(isLightningPath(params.path)) && get(lightning)) {
        return get(lightningBooleanResults(params));
      }

      return booleanCountResults(params);
    },
});

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
        ].filter(({ count }) => count),
      };
      if (none) {
        result.results.push({ value: null, count: none });
      }
      return result;
    },
});
