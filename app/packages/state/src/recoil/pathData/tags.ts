import { selectorFamily } from "recoil";
import { aggregation } from "../aggregations";
import { groupStatistics } from "../groups";
import * as schemaAtoms from "../schema";

export const labelTagCounts = selectorFamily<
  { [key: string]: number },
  { modal: boolean; extended: boolean }
>({
  key: "labelTagCounts",
  get:
    ({ modal, extended }) =>
    ({ get }) => {
      const data = get(schemaAtoms.labelPaths({})).map((path) =>
        get(
          aggregation({
            extended,
            modal,
            path: `${path}.tags`,
            mixed: get(groupStatistics(modal)) === "group",
          })
        )
      );

      const result = {};

      for (let i = 0; i < data.length; i++) {
        const aggregation = data[i];
        if (aggregation.__typename !== "StringAggregation") {
          throw new Error("unexpected");
        }

        const { values } = aggregation;
        for (let j = 0; j < values.length; j++) {
          const { value, count } = values[j];
          if (!result[value]) {
            result[value] = 0;
          }

          result[value] += count;
        }
      }

      return result;
    },
});

export const sampleTagCounts = selectorFamily<
  { [key: string]: number },
  { modal: boolean; extended: boolean }
>({
  key: "sampleTagCounts",
  get:
    (params) =>
    ({ get }) => {
      const data = get(
        aggregation({
          ...params,
          path: "tags",
          mixed: get(groupStatistics(params.modal)) === "group",
        })
      );
      if (data.__typename !== "StringAggregation") {
        throw new Error("unexpected");
      }
      return Object.fromEntries(
        data.values.map(({ value, count }) => [value, count])
      );
    },
});
