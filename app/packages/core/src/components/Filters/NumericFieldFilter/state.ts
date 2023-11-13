import { Nonfinite, boundsAtom, nonfiniteAtom } from "@fiftyone/state";
import { selectorFamily } from "recoil";

type Params = {
  defaultRange?: [number, number];
  path: string;
};

export const FLOAT_NONFINITES: Nonfinite[] = ["inf", "ninf", "nan"];

export const hasBounds = selectorFamily({
  key: "hasBounds",
  get:
    (params: Params) =>
    ({ get }) => {
      return Boolean(get(boundsAtom(params))?.every((b) => b !== null));
    },
});

export const hasNonfinites = selectorFamily({
  key: "hasNonfinites",
  get:
    (params: Params) =>
    ({ get }) => {
      return FLOAT_NONFINITES.every((key) =>
        get(nonfiniteAtom({ ...params, key, modal: false }))
      );
    },
});

export const oneBound = selectorFamily({
  key: "oneBound",
  get:
    (params: { defaultRange?: [number, number]; path: string }) =>
    ({ get }) => {
      return (
        get(hasBounds(params)) &&
        get(boundsAtom(params))[0] === get(boundsAtom(params))[1]
      );
    },
});
