import * as fos from "@fiftyone/state";
import {
  getSubset,
  listSubsets,
  useEpisodeSelectionActions,
  useGridSelectionBoundary,
  useGridSelectionDataset,
  useInvalidateSelectionScope,
  useSelectionScopeRevision,
  type SavedSubset,
  type SelectionBoundary,
  type SelectionCounts,
  type SelectionUnit,
  type SubsetPage,
} from "@fiftyone/state/src/selection";
import { useCallback, useEffect, useState } from "react";

/**
 * Opens a saved subset (or the entire dataset) as the browsing boundary. A
 * fresh scope starts without captures: a selection made in one scope must
 * never silently become the target of actions in another.
 */
export function useOpenSubset(datasetId: string) {
  const { domainId } = useGridSelectionDataset();
  const [, setBoundary] = useGridSelectionBoundary();
  const { clear } = useEpisodeSelectionActions(domainId);
  const clearTemporalTags = fos.useClearTemporalTagConstraint();
  const invalidate = useInvalidateSelectionScope(datasetId);
  return useCallback(
    (subsetId?: string, subsetScope?: SelectionBoundary["subsetScope"]) => {
      invalidate();
      clearTemporalTags();
      clear();
      setBoundary({ subsetId, subsetScope });
    },
    [invalidate, clearTemporalTags, clear, setBoundary],
  );
}

/** Subsets per page in pickers; past this many, a search field appears too. */
export const SUBSET_PAGE_SIZE = 5;

/**
 * One page of the dataset's saved subsets, reloaded after every subset write.
 * The previous page stays on screen while the next one loads.
 */
export function useSavedSubsets(
  datasetId: string,
  options: { search?: string; page?: number } = {},
) {
  const { search = "", page = 0 } = options;
  const revision = useSelectionScopeRevision(datasetId);
  const [state, setState] = useState<{
    page: SubsetPage | null;
    error: string | null;
    loading: boolean;
  }>({ page: null, error: null, loading: true });
  const [reloads, setReloads] = useState(0);
  const reload = useCallback(() => setReloads((count) => count + 1), []);
  // This effect fetches the requested page, and again whenever a subset
  // write bumps the scope revision or a caller asks for a reload.
  useEffect(() => {
    if (!datasetId) return undefined;
    let active = true;
    setState((current) => ({ ...current, loading: true }));
    listSubsets(datasetId, {
      search: search.trim() || undefined,
      skip: page * SUBSET_PAGE_SIZE,
      limit: SUBSET_PAGE_SIZE,
    })
      .then((value) => {
        if (active) setState({ page: value, error: null, loading: false });
      })
      .catch((cause: unknown) => {
        if (active)
          setState({ page: null, error: String(cause), loading: false });
      });
    return () => {
      active = false;
    };
  }, [datasetId, revision, reloads, search, page]);
  return {
    subsets: state.page?.subsets ?? null,
    /** How many subsets match the search. */
    total: state.page?.total ?? 0,
    /** How many subsets the dataset has in all. */
    count: state.page?.count ?? 0,
    loading: state.loading,
    error: state.error,
    reload,
  };
}

/** One subset by id with live counts, or null while unknown or when there is none. */
export function useSavedSubset(
  datasetId: string,
  subsetId: string | undefined,
) {
  const revision = useSelectionScopeRevision(datasetId);
  const [state, setState] = useState<{
    id: string | undefined;
    subset: SavedSubset | null;
    error: string | null;
  }>({ id: undefined, subset: null, error: null });
  // This effect reads the subset whenever its id or a subset write changes.
  useEffect(() => {
    if (!datasetId || !subsetId) return undefined;
    let active = true;
    getSubset(datasetId, subsetId)
      .then((subset) => {
        if (active) setState({ id: subsetId, subset, error: null });
      })
      .catch((cause: unknown) => {
        if (active)
          setState({ id: subsetId, subset: null, error: String(cause) });
      });
    return () => {
      active = false;
    };
  }, [datasetId, subsetId, revision]);
  if (!subsetId) return { subset: null, error: null, loading: false };
  const current = state.id === subsetId;
  return {
    subset: current ? state.subset : null,
    error: current ? state.error : null,
    loading: !current,
  };
}

/** The scope a subset opens in when the caller does not choose one. */
export function defaultSubsetScope(
  counts: SelectionCounts,
): NonNullable<SelectionBoundary["subsetScope"]> {
  return counts.segments > 0 && counts.fullEpisodes === 0
    ? "segments"
    : "episodes";
}

/**
 * One scope row per way a subset can be browsed. Most subsets have one; a
 * subset holding both whole members and segments offers each, named.
 */
export function subsetRows(subset: SavedSubset, unit: SelectionUnit) {
  const { fullEpisodes, segments } = subset.counts;
  const rows: {
    scope: NonNullable<SelectionBoundary["subsetScope"]>;
    count: number;
    kind: string | null;
  }[] = [];
  const mixed = fullEpisodes > 0 && segments > 0;
  if (fullEpisodes > 0 || segments === 0)
    rows.push({
      scope: "episodes",
      count: fullEpisodes,
      kind: mixed ? `Whole ${unit.many}` : null,
    });
  if (segments > 0)
    rows.push({
      scope: "segments",
      count: segments,
      kind: mixed ? "Segments" : null,
    });
  return rows;
}
