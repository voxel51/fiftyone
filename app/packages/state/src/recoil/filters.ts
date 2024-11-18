import {
  datasetFragment,
  datasetFragment$key,
  graphQLSyncFragmentAtom,
} from "@fiftyone/relay";
import { VALID_PRIMITIVE_TYPES } from "@fiftyone/utilities";
import { DefaultValue, selectorFamily } from "recoil";
import { getSessionRef, sessionAtom } from "../session";
import { pathHasIndexes, queryPerformance } from "./queryPerformance";
import { expandPath, fields } from "./schema";
import { hiddenLabelIds, isFrameField } from "./selectors";
import { State } from "./types";

export const { getQueryPerformancePath, setQueryPerformancePath } = (() => {
  let queryPerformancePath: { isFrameField: boolean; path: string } | null =
    null;

  return {
    getQueryPerformancePath: () => queryPerformancePath,
    setQueryPerformancePath: (path: string | null, isFrameField = false) => {
      if (path) {
        queryPerformancePath = { isFrameField, path };
      } else {
        queryPerformancePath = null;
      }
    },
  };
})();

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
            setQueryPerformancePath(null);
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
      const atom = modal ? modalFilters : filters;
      const newFilters = Object.assign({}, get(atom));

      const setQueryPerformance =
        !modal && get(queryPerformance) && get(pathCanBeOptimized(path));

      if (filter === null || filter instanceof DefaultValue) {
        delete newFilters[path];
        setQueryPerformance && setQueryPerformancePath(null);
      } else {
        newFilters[path] = filter;
        setQueryPerformance &&
          setQueryPerformancePath(path, setQueryPerformance.isFrameField);
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

export const pathCanBeOptimized = selectorFamily({
  key: "pathCanBeOptimized",
  get:
    (path: string) =>
    ({ get }) => {
      if (path === "_label_tags") {
        return false;
      }
      const indexed = get(pathHasIndexes(path));
      const frameField = get(isFrameField(path));
      if (indexed && !frameField) {
        return false;
      }
      const f = get(filters);
      for (const key of Object.keys(f)) {
        if (key === path) {
          continue;
        }
        if (get(pathHasIndexes(path)) && !get(isFrameField(path))) {
          return false;
        }
      }
      return { isFrameField: frameField };
    },
});
