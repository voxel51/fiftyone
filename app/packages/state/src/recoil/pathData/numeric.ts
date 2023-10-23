import { selectorFamily } from "recoil";
import { aggregation, count } from "../aggregations";
import { isLightningPath, lightning } from "../lightning";
import { lightningNonfinites } from "./lightningNumeric";

export const bounds = selectorFamily({
  key: "bounds",
  get:
    (params: { extended: boolean; path: string; modal: boolean }) =>
    ({ get }) => {
      const { min, max } = get(aggregation(params)) || {};

      return [min, max] as [number, number];
    },
});

export const nonfiniteData = selectorFamily({
  key: "nonfiniteData",
  get:
    (params: { extended: boolean; path: string; modal: boolean }) =>
    ({ get }) => {
      if (get(lightning) && get(isLightningPath(params.path))) {
        return { lightning: true, ...get(lightningNonfinites(params.path)) };
      }

      const { inf, nan, ninf, exists } = get(aggregation(params));

      const { count: parentCount } = get(
        aggregation({
          ...params,
          path: params.path.split(".").slice(0, -1).join("."),
        })
      );
      return {
        inf: inf === undefined ? 0 : inf,
        nan: nan === undefined ? 0 : nan,
        ninf: ninf === undefined ? 0 : ninf,
        none: parentCount - exists,
      };
    },
});

/**
 * @hidden
 */
export type Nonfinite = "nan" | "ninf" | "inf" | "none";

export const nonfiniteCount = selectorFamily<
  number,
  { extended: boolean; path: string; modal: boolean; key: Nonfinite }
>({
  key: "nonfiniteCount",
  get:
    ({ key, ...params }) =>
    ({ get }) =>
      get(nonfiniteCounts(params))[key],
});

export const boundedCount = selectorFamily<
  number,
  { extended: boolean; path: string; modal: boolean }
>({
  key: "boundedCount",
  get:
    (params) =>
    ({ get }) => {
      const nonfinites = Object.entries(get(nonfiniteCounts(params))).reduce(
        (sum, [key, count]) => (key === "none" ? sum : sum + (count || 0)),
        0
      );

      return get(count(params)) - nonfinites;
    },
});
