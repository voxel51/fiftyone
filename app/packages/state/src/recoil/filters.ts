import {
  datasetFragment,
  datasetFragment$key,
  graphQLSyncFragmentAtom,
} from "@fiftyone/relay";
import { VALID_PRIMITIVE_TYPES } from "@fiftyone/utilities";
import { useMemo } from "react";
import {
  DefaultValue,
  selectorFamily,
  type TransactionInterface_UNSTABLE,
  useRecoilValue,
} from "recoil";
import { getSessionRef, sessionAtom } from "../session";
import { activeFilterValues } from "./activeFilterValues";
import {
  extendedSelection,
  extendedSelectionOverrideStage,
  isDatasetChange,
} from "./atoms";
import { pathHasIndexes, queryPerformance } from "./queryPerformance";
import { expandPath, fields } from "./schema";
import { hiddenLabelIds, isFrameField } from "./selectors";
import type { State } from "./types";

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

// `read` runs on every fragment update, so it must hand back the last write
// or a refetch drops the filters. Module scope so the reset can clear it.
let currentFilters: State.Filters | undefined;

/**
 * What the filters atom reads from a dataset fragment update: the session's
 * filters on the first read, none after a dataset switch, and otherwise the
 * last write. A reload of the same dataset (a layout write, a refresh) keeps
 * them; a view change clears them through {@link resetFiltersTransaction}.
 */
export function readFilters(
  data: { datasetId: string },
  previous: { datasetId: string } | null,
): State.Filters {
  if (currentFilters === undefined) {
    currentFilters = getSessionRef().filters;
  } else if (isDatasetChange(data, previous)) {
    currentFilters = {};
  }

  return currentFilters;
}

export const filters = graphQLSyncFragmentAtom<
  datasetFragment$key,
  State.Filters
>(
  {
    fragments: [datasetFragment],
    keys: ["dataset"],
    default: {},
    read: readFilters,
  },
  {
    effects: [
      ({ onSet }) => {
        onSet((next) => {
          setQueryPerformancePath(null);
          currentFilters = next;
        });
      },
    ],
    key: "filters",
  },
);

/**
 * Clears the sidebar filters inside the caller's Recoil transaction. The
 * atom's effect updates the value `read` hands back only once the
 * transaction commits, so that is cleared here as well, in step with the
 * reset.
 */
export function resetFiltersTransaction(
  cb: Pick<TransactionInterface_UNSTABLE, "reset">,
): void {
  cb.reset(filters);
  currentFilters = {};
}

export { activeFilterValues } from "./activeFilterValues";

/** Recoil-bound {@link activeFilterValues} for the grid's filter set. */
export const useActiveFilterValues = (path: string): string[] => {
  const current = useRecoilValue(filters);
  return useMemo(() => activeFilterValues(current, path), [current, path]);
};

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

/**
 * Field filters alone — the only input an aggregation's `extended` flag
 * controls. An extended selection (grid checkboxes, a plot lasso, an override
 * stage) rides in `extendedStages`, which every aggregation sends whether or
 * not it is extended, so counting it as a filter made the extended
 * aggregation a byte-identical twin of the unextended one.
 */
export const hasFieldFilters = selectorFamily<boolean, boolean>({
  key: "hasFieldFilters",
  get:
    (modal) =>
    ({ get }) =>
      Object.keys(get(modal ? modalFilters : filters)).length > 0,
});

export const hasFilters = selectorFamily<boolean, boolean>({
  key: "hasFilters",
  get:
    (modal) =>
    ({ get }) => {
      const f = Object.keys(get(modal ? modalFilters : filters)).length > 0;
      const hidden = Boolean(modal && get(hiddenLabelIds).size);
      const selection =
        !modal && Boolean(get(extendedSelection)?.selection?.length);
      // An extended selection expressed as a view-stage override (e.g. a
      // plot lasso) scopes the grid just like an id-list selection does
      const override = !modal && Boolean(get(extendedSelectionOverrideStage));

      return f || hidden || selection || override;
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
        }),
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
      const indexed = get(pathHasIndexes({ path, withFilters: false }));
      const frameField = get(isFrameField(path));
      if (indexed && !frameField) {
        return false;
      }
      const f = get(filters);
      for (const key of Object.keys(f)) {
        if (key === path) {
          continue;
        }
        if (
          get(pathHasIndexes({ path, withFilters: false })) &&
          !get(isFrameField(path))
        ) {
          return false;
        }
      }
      return { isFrameField: frameField };
    },
});
