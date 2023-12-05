import {
  datasetFragment,
  datasetFragment$key,
  graphQLSyncFragmentAtom,
} from "@fiftyone/relay";
import { VALID_PRIMITIVE_TYPES } from "@fiftyone/utilities";
import { DefaultValue, atom, selector, selectorFamily } from "recoil";
import { lightning, lightningPaths, lightningUnlocked } from "./lightning";
import { dbPath, expandPath, fields } from "./schema";
import { hiddenLabelIds } from "./selectors";
import {
  granularSidebarExpandedStore,
  sidebarExpandedStore,
} from "./sidebarExpanded";
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

export const lightningFilters = selector({
  key: "lightningFilters",
  get: ({ get }) => {
    if (!get(lightning)) {
      return {};
    }

    const f = { ...get(filters) };
    const paths = get(lightningPaths(""));
    for (const p in f) {
      if (!paths.has(get(dbPath(p)))) {
        delete f[p];
      }
    }

    return f;
  },
});

export const filter = selectorFamily<
  State.Filter,
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
    ({ get, reset, set }, filter) => {
      const atom = modal ? modalFilters : filters;
      const newFilters = Object.assign({}, get(atom));

      if (!modal && get(lightningUnlocked)) {
        const paths = get(lightningPaths(""));

        if (paths.has(path)) {
          for (const p in newFilters) {
            if (!paths.has(p)) {
              delete newFilters[p];
            }
          }
          reset(granularSidebarExpandedStore);
          set(sidebarExpandedStore(false), (current) => {
            const next = { ...current };

            for (const parent in next) {
              if (![...paths].some((p) => p.startsWith(parent))) {
                delete next[parent];
              }
            }

            return next;
          });
        }
      }

      if (filter === null || filter instanceof DefaultValue) {
        delete newFilters[path];
      } else {
        newFilters[path] = filter;
      }
      set(atom, newFilters);
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
});
