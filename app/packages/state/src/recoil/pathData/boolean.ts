import { selectorFamily } from "recoil";
import { aggregation } from "../aggregations";
import { noneCount } from "./counts";

export const booleanCountResults = selectorFamily<
  { count: number; results: [boolean | null, number][] },
  { path: string; modal: boolean; extended: boolean }
>({
  key: "booleanCountResults",
  get:
    (params) =>
    ({ get }) => {
      const data = get(aggregation(params));
      const none = get(noneCount(params));

      if (data.__typename !== "BooleanAggregation") {
        throw new Error("unexpected");
      }

      const result = {
        count: data.false + data.true,
        results: [
          [false, data.false],
          [true, data.true],
        ] as [boolean, number][],
      };
      if (none) {
        result.results.push([null, none]);
      }
      return result;
    },
});
