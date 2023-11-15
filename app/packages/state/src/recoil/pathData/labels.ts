import { selectorFamily } from "recoil";
import { aggregations } from "../aggregations";
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

      const paths = get(activeLabelPaths({ modal: params.modal }));
      const results = get(aggregations({ ...params, paths }));
      for (const data of results) {
        sum += data.count;
      }

      return sum;
    },
});
