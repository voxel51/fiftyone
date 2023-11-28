import {
  count,
  expandPath,
  field,
  fields,
  getSkeleton,
  lightningPaths,
} from "@fiftyone/state";
import { VALID_PRIMITIVE_TYPES } from "@fiftyone/utilities";
import { selectorFamily } from "recoil";
import { getFilterItemsProps } from "./useFilterData";

// granular filters that will display in 'see more...'
export const hasMoreFilters = selectorFamily({
  key: "hasMoreFilter",
  get:
    (path: string) =>
    ({ get }) => {
      const paths = get(lightningPaths(path));
      const expanded = get(expandPath(path));
      const skeleton = get(getSkeleton);
      const parent = get(field(expanded));

      const children = get(
        fields({
          path: expanded,
          ftype: VALID_PRIMITIVE_TYPES,
        })
      );

      return getFilterItemsProps(expanded, false, parent, children, skeleton)
        .map(({ path }) => path)
        .filter((p) => !paths.has(p))
        .some(
          (path) => get(count({ path, extended: false, modal: false })) > 0
        );
    },
});
