import {
  datasetFragment,
  datasetFragment$key,
  graphQLSyncFragmentAtom,
} from "@fiftyone/relay";
import { VALID_PRIMITIVE_TYPES } from "@fiftyone/utilities";
import { DefaultValue, atom, selector, selectorFamily } from "recoil";
import { getSessionRef, sessionAtom } from "../session";
import { indexedPaths, pathHasIndexes } from "./queryPerformance";
import { expandPath, fields } from "./schema";
import { hiddenLabelIds, isFrameField } from "./selectors";
import { sidebarExpandedStore } from "./sidebarExpanded";
import { State } from "./types";

export const modalFilters = sessionAtom({
  key: "modalFilters",
});

export const filters = (() => {
  let current: State.Filters;
  return graphQLSyncFragmentAtom<datasetFragment$key, State.Filters>(
    {
      fragments: [datasetFragment],
      keys: ["dataset"],
      default: {},
      read: (data, previous) => {
        if (current === undefined) {
          current = getSessionRef().filters;
        } else if (previous && data.id !== previous?.id) {
          current = {};
        }

        return current;
      },
    },
    {
      effects: [
        ({ onSet }) => {
          onSet((next) => {
            current = next;
          });
        },
      ],
      key: "filters",
    }
  );
})();

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
    ({ get, set }, filter) => {
      if (!modal) {
        set(lastAppliedPathFilter, path);
      }
      const atom = modal ? modalFilters : filters;
      const newFilters = Object.assign({}, get(atom));
      const currentLightningPaths = get(indexedPaths(""));

      if (!modal && currentLightningPaths.has(path)) {
        for (const p in newFilters) {
          if (!currentLightningPaths.has(p)) {
            delete newFilters[p];
          }
        }

        set(sidebarExpandedStore(false), (current) => {
          const next = { ...current };

          for (const parent in next) {
            if (![...currentLightningPaths].some((p) => p.startsWith(parent))) {
              delete next[parent];
            }
          }

          return next;
        });
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
      if (!path) {
        return false;
      }
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

export const lastAppliedPathFilter = atom<string | null>({
  key: "lastAppliedPathFilter",
  default: null,
});
export const pathThatCanBeOptimized = selector({
  key: "pathThatCanBeOptimized",
  get: ({ get }) => {
    // does not have index, or is a frame field, and is not _label_tags
    const path = get(lastAppliedPathFilter);
    if (!path) {
      return null;
    }
    if (path === "_label_tags") {
      return null;
    }
    const indexed = get(pathHasIndexes(path));
    const frameField = get(isFrameField(path));
    if (indexed && !frameField) {
      return null;
    }
    const f = get(filters);
    for (const key of Object.keys(f)) {
      if (key === path) {
        continue;
      }
      if (get(pathHasIndexes(path)) && !get(isFrameField(path))) {
        return null;
      }
    }
    return { path, isFrameField: frameField };
  },
});
