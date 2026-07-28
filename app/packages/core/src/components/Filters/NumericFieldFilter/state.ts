import type { Nonfinite } from "@fiftyone/state";
import {
  boundsAtom,
  nonfiniteData,
  queryPerformance,
  rangeAtom,
} from "@fiftyone/state";
import { selectorFamily } from "recoil";

export const FLOAT_NONFINITES: Nonfinite[] = ["inf", "ninf", "nan"];

export const hasBounds = selectorFamily({
  key: "hasBounds",
  get:
    (params: { path: string; modal: boolean; shouldCalculate?: boolean }) =>
    ({ get }) => {
      const shouldCalculate = params.shouldCalculate ?? true;

      return shouldCalculate
        ? Boolean(get(boundsAtom(params))?.every((b) => b !== null))
        : false;
    },
});

export const hasDefaultRange = selectorFamily({
  key: "hasDefaultRange",
  get:
    (params: { modal: boolean; path: string }) =>
    ({ get }) => {
      return Boolean(get(rangeAtom(params))?.every((r) => r === null));
    },
});

export const numericFilterPrefetch = selectorFamily({
  key: "numericFilterPrefetch",
  get:
    (params: { path: string; modal: boolean }) =>
    ({ get }) => {
      // Opening a numeric filter reads the field aggregation (via
      // hasBounds, up in useShow/NumericFieldFilter) and, when
      // unfiltered, the parent aggregation (via Nonfinites ->
      // nonfiniteData, down in RangeSlider). Rendered top-down the tree
      // suspends on the field first and only requests the parent once it
      // resolves — a render waterfall that doubles latency when each
      // aggregation is expensive (large datasets, cold caches, slower
      // backends). Read at the top of NumericFieldFilter
      // (before useShow), this issues both aggregations in one
      // waitForAll so they load concurrently.
      //
      // No-op on the lightning path: under query performance the sidebar
      // already prefetches the lightning data and useShow doesn't
      // calculate bounds, so there's no waterfall to fix and we avoid
      // perturbing that path. Gated on the default range to match when
      // <Nonfinites> actually reads the parent (no extra fetch once a
      // range filter is applied).
      if (!params.modal && get(queryPerformance)) {
        return null;
      }
      if (get(hasDefaultRange(params))) {
        get(nonfiniteData({ ...params, extended: false }));
      }
      return null;
    },
});

export const nonfinitesText = selectorFamily({
  key: "nonfinitesText",
  get:
    (params: { path: string; modal: boolean }) =>
    ({ get }) => {
      const data = get(nonfiniteData({ ...params, extended: false }));
      const result = Object.entries(data).filter(
        ([k, v]) => k !== "none" && Boolean(v),
      );

      return result.length ? result.map(([key]) => key).join(", ") : null;
    },
});

export const oneBound = selectorFamily({
  key: "oneBound",
  get:
    (params: { path: string; modal: boolean }) =>
    ({ get }) => {
      return get(hasBounds(params)) &&
        get(boundsAtom(params))[0] === get(boundsAtom(params))[1]
        ? get(boundsAtom(params))[0]
        : null;
    },
});
