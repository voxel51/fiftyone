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
      const paths = get(activeLabelPaths({ modal: params.modal }));

      if (!paths.length) {
        return 0;
      }

      let sum = 0;
      const results = get(aggregations({ ...params, paths }));
      for (const data of results) {
        sum += data.count;
      }

      return sum;
    },
});
