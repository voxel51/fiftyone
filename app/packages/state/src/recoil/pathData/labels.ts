import { selectorFamily } from "recoil";
import { aggregation } from "../aggregations";
import { activeLabelPaths } from "../schema";

export const labelCount = selectorFamily<
  number | null,
  { modal: boolean; extended: boolean }
>({
  key: "labelCount",
  get:
    (params) =>
    ({ get }) => {
      let sum = 0;

      for (const path of get(activeLabelPaths({ modal: params.modal }))) {
        const data = get(aggregation({ ...params, path }));
        sum += data.count;
      }

      return sum;
    },
});
