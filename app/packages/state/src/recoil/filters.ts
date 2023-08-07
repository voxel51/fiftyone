import {
  datasetFragment,
  datasetFragment$key,
  graphQLSyncFragmentAtom,
} from "@fiftyone/relay";
import { VALID_PRIMITIVE_TYPES } from "@fiftyone/utilities";
import { DefaultValue, atom, selectorFamily } from "recoil";
import { expandPath, fields } from "./schema";
import { hiddenLabelIds } from "./selectors";
import { State } from "./types";

export const modalFilters = atom<State.Filters>({
  key: "modalFilters",
  default: {},
});

export const filters = (() => {
  let current: State.Filters = {};
  return graphQLSyncFragmentAtom<datasetFragment$key, State.Filters>(
    {
      fragments: [datasetFragment],
      keys: ["dataset"],
      default: {},
      read: (data, previous) => {
        if (data.id !== previous?.id) {
          current = {};
        }
        return current;
      },
    },
    {
      key: "filters",
    }
  );
})();

export const filter = selectorFamily<
  State.Filters,
  { path: string; modal: boolean }
>({
  key: "filter",
  get:
    ({ path, modal }) =>
    ({ get }) => {
      const f = get(modal ? modalFilters : filters);

      if (f[path]) {
        return f[path];
      }

      return null;
    },
  set:
    ({ path, modal }) =>
    ({ get, set }, filter) => {
      const atom = modal ? modalFilters : filters;
      const newFilters = Object.assign({}, get(atom));
      if (filter === null || filter instanceof DefaultValue) {
        delete newFilters[path];
      } else {
        newFilters[path] = filter;
      }
      set(atom, newFilters);
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const hasFilters = selectorFamily<boolean, boolean>({
  key: "hasFilters",
  get:
    (modal) =>
    ({ get }) => {
      const f = Object.keys(get(modal ? modalFilters : filters)).length > 0;
      const hidden = Boolean(modal && get(hiddenLabelIds).size);

      return f || hidden;
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const fieldIsFiltered = selectorFamily<
  boolean,
  { path: string; modal?: boolean }
>({
  key: "fieldIsFiltered",
  get:
    ({ path, modal }) =>
    ({ get }) => {
      const f = get(modal ? modalFilters : filters);

      const expandedPath = get(expandPath(path));
      const paths = get(
        fields({
          path: expandedPath,
          ftype: VALID_PRIMITIVE_TYPES,
        })
      );

      return (
        Boolean(f[path]) ||
        paths.some(({ name }) => f[`${expandedPath}.${name}`])
      );
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});
