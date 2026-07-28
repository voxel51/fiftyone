import { selectorFamily, waitForAll } from "recoil";
import { aggregation } from "../aggregations";
import { queryPerformance } from "../queryPerformance";
import { count } from "./counts";
import { lightningNonfinites } from "./lightningNumeric";

export const bounds = selectorFamily<
  [number, number],
  { extended: boolean; path: string; modal: boolean }
>({
  key: "bounds",
  get:
    (params) =>
    ({ get }) => {
      const data = get(aggregation(params));

      if (
        data.__typename === "FloatAggregation" ||
        data.__typename === "IntAggregation"
      ) {
        return [data.min, data.max];
      }

      throw new Error("unexpected");
    },
});

export const nonfiniteData = selectorFamily({
  key: "nonfiniteData",
  get:
    (params: { extended: boolean; path: string; modal: boolean }) =>
    ({ get }) => {
      if (!params.modal && get(queryPerformance)) {
        return get(lightningNonfinites(params.path));
      }

      // Fetch the field's aggregation and its parent's concurrently:
      // reading them with sequential ``get``s makes Recoil suspend on
      // the first, then fire the second only after it resolves — a
      // waterfall that doubles latency when each aggregation is
      // expensive (large datasets, cold caches, slower backends).
      // ``waitForAll`` puts both in flight at once.
      const [data, { count: parentCount }] = get(
        waitForAll([
          aggregation(params),
          aggregation({
            ...params,
            path: params.path.split(".").slice(0, -1).join("."),
          }),
        ]),
      );

      if (data.__typename === "IntAggregation") {
        return {
          none: parentCount - data.exists,
        };
      }

      if (data.__typename !== "FloatAggregation") {
        throw new Error("unexpected");
      }

      const { inf, nan, ninf, exists } = data;

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
      get(nonfiniteData(params))[key],
});

export const boundedCount = selectorFamily<
  number,
  { extended: boolean; path: string; modal: boolean }
>({
  key: "boundedCount",
  get:
    (params) =>
    ({ get }) => {
      const nonfinites = Object.entries(get(nonfiniteData(params))).reduce(
        (sum, [key, count]) => (key === "none" ? sum : sum + (count || 0)),
        0,
      );

      return get(count(params)) - nonfinites;
    },
});
