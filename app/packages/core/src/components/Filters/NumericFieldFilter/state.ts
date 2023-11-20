import {
  Nonfinite,
  boundsAtom,
  nonfiniteAtom,
  rangeAtom,
} from "@fiftyone/state";
import { selectorFamily } from "recoil";

export const FLOAT_NONFINITES: Nonfinite[] = ["inf", "ninf", "nan"];

export const hasBounds = selectorFamily({
  key: "hasBounds",
  get:
    (path: string) =>
    ({ get }) => {
      return Boolean(get(boundsAtom({ path }))?.every((b) => b !== null));
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

export const hasNonfinites = selectorFamily({
  key: "hasNonfinites",
  get:
    (path: string) =>
    ({ get }) => {
      return FLOAT_NONFINITES.every((key) =>
        get(nonfiniteAtom({ path, key, modal: false }))
      );
    },
});

export const oneBound = selectorFamily({
  key: "oneBound",
  get:
    (path: string) =>
    ({ get }) => {
      return (
        get(hasBounds(path)) &&
        get(boundsAtom({ path }))[0] === get(boundsAtom({ path }))[1]
      );
    },
});
