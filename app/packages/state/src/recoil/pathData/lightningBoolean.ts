import { selectorFamily } from "recoil";
import { lightningQuery } from "../queryPerformance";

export const lightningBooleanResults = selectorFamily<
  {
    count: number | null;
    results: { count: number | null; value: string | null }[];
  },
  { path: string; modal: boolean; extended: boolean }
>({
  key: "lightningBooleanResults",
  get:
    (params) =>
    ({ get }) => {
      const [data] = get(lightningQuery([{ path: params.path }]));

      if (data.__typename !== "BooleanLightningResult") {
        throw new Error(
          `unexpected ${data.__typename} for path '${params.path}' in lightningBooleanResults`
        );
      }

      return {
        count: null,
        results: [
          { value: "False", count: data.false },
          { value: "True", count: data.true },
        ]
          .filter(({ count }) => count)
          .map(({ value }) => ({ value, count: null })),
      };
    },
});
