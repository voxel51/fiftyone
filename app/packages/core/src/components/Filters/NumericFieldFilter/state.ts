import type { Nonfinite } from "@fiftyone/state";
import { boundsAtom, nonfiniteData, rangeAtom } from "@fiftyone/state";
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
  key: "hasBounds",
  get:
    (params: { modal: boolean; path: string }) =>
    ({ get }) => {
      return Boolean(get(rangeAtom(params))?.every((r) => r === null));
    },
});

export const nonfinitesText = selectorFamily({
  key: "nonfinitesText",
  get:
    (params: { path: string; modal: boolean }) =>
    ({ get }) => {
      const data = get(nonfiniteData({ ...params, extended: false }));
      const result = Object.entries(data).filter(
        ([k, v]) => k !== "none" && Boolean(v)
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
