import { selector, selectorFamily } from "recoil";
import { labelPaths } from "./schema";

const labelPathsSet = selector({
  key: "labelPathsSet",
  get: ({ get }) => new Set(get(labelPaths({ expanded: false }))),
});

export const isLabelPath = selectorFamily({
  key: "isLabelPath",
  get:
    (path: string) =>
    ({ get }) =>
      get(labelPathsSet).has(path),
});
