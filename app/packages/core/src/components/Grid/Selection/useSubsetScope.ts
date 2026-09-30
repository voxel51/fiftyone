import * as fos from "@fiftyone/state";
import {
  getSubset,
  getSubsetCounts,
  listSubsets,
  selectionDomainId,
  useGridSelectionBoundary,
  useGridSelectionDataset,
  useInvalidateSelectionScope,
  useOpenSelectionBoundary,
  useSelectionBucketCommands,
  useSelectionScopeRevision,
  viewConversion,
  type SavedSubset,
  type SelectionBoundary,
  type SelectionCounts,
  type SelectionUnit,
  type SubsetPage,
} from "@fiftyone/state/src/selection";
import { useCallback, useContext, useEffect, useRef, useState } from "react";

import { SubsetPagesContext } from "./subsetPages";

/**
 * Opens a saved subset (or the entire dataset) as the browsing boundary. A
 * fresh scope starts without captures: a selection made in one scope must
 * never silently become the target of actions in another.
 */
export function useOpenSubset(datasetId: string) {
  const { domainId, subsetViewId } = useGridSelectionDataset();
  const [, setBoundary] = useGridSelectionBoundary();
  const { clearAll: clear } = useSelectionBucketCommands(domainId);
  const clearTemporalTags = fos.useClearTemporalTagConstraint();
  const invalidate = useInvalidateSelectionScope(datasetId);
  const openBoundary = useOpenSelectionBoundary();
  const setView = fos.useSetView();
  const setGroupSlice = fos.useSetGroupSlice();
  const groupSlices = fos.useGroupSlices();
  return useCallback(
    (
      subsetId?: string,
      subsetScope?: SelectionBoundary["subsetScope"],
      view?: SavedSubset["view"],
      preferredGroupSlice?: string | null,
    ) => {
      invalidate();
      if (preferredGroupSlice && groupSlices.includes(preferredGroupSlice))
        setGroupSlice(preferredGroupSlice);
      clearTemporalTags();
      clear();
      // An exact frame/range view belongs to its subset. Leaving that scope
      // must also leave the conversion, especially when deleting the subset.
      const nextView =
        view === undefined && !subsetId && subsetViewId ? null : view;
      const targetDomain =
        nextView === undefined
          ? domainId
          : selectionDomainId(
              datasetId,
              viewConversion(nextView ?? [])?.key ?? null,
            );
      if (targetDomain === domainId) setBoundary({ subsetId, subsetScope });
      else {
        openBoundary(targetDomain, { subsetId, subsetScope });
        setView([...(nextView ?? [])]);
      }
    },
    [
      invalidate,
      clearTemporalTags,
      clear,
      setBoundary,
      datasetId,
      domainId,
      subsetViewId,
      openBoundary,
      setView,
      setGroupSlice,
      groupSlices,
    ],
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
  options: { search?: string; page?: number; view?: readonly unknown[] } = {},
) {
  const { search = "", page = 0 } = options;
  const cache = useContext(SubsetPagesContext);
  const viewKey = JSON.stringify(options.view);
  const revision = useSelectionScopeRevision(datasetId);
  const cacheKey = JSON.stringify([
    datasetId,
    revision,
    search.trim(),
    page,
    viewKey,
  ]);
  const [state, setState] = useState<{
    datasetId: string;
    page: SubsetPage | null;
    error: string | null;
    loading: boolean;
  }>(() => ({
    datasetId,
    page: cache?.peek(cacheKey) ?? null,
    error: null,
    loading: !cache?.peek(cacheKey),
  }));
  const [reloads, setReloads] = useState(0);
  const forceReload = useRef(false);
  const reload = useCallback(() => {
    forceReload.current = true;
    setReloads((count) => count + 1);
  }, []);
  // This effect fetches the requested page, and again whenever a subset
  // write bumps the scope revision or a caller asks for a reload.
  useEffect(() => {
    if (!datasetId) return undefined;
    let active = true;
    const cached = cache?.peek(cacheKey);
    setState((current) => ({
      datasetId,
      page: cached ?? (current.datasetId === datasetId ? current.page : null),
      error: null,
      loading: !cached,
    }));
    const load = () =>
      listSubsets(datasetId, {
        search: search.trim() || undefined,
        skip: page * SUBSET_PAGE_SIZE,
        limit: SUBSET_PAGE_SIZE,
        ...(viewKey !== undefined && { view: JSON.parse(viewKey) }),
      });
    const pending = cache
      ? cache.get(cacheKey, load, forceReload.current)
      : load();
    forceReload.current = false;
    pending
      .then((value) => {
        if (active)
          setState({ datasetId, page: value, error: null, loading: false });
      })
      .catch((cause: unknown) => {
        if (active)
          setState({
            datasetId,
            page: null,
            error: String(cause),
            loading: false,
          });
      });
    return () => {
      active = false;
    };
  }, [cache, cacheKey, datasetId, revision, reloads, search, page, viewKey]);
  const current = state.datasetId === datasetId;
  return {
    subsets: current ? (state.page?.subsets ?? null) : null,
    /** How many subsets match the search. */
    total: current ? (state.page?.total ?? 0) : 0,
    /** How many subsets the dataset has in all. */
    count: current ? (state.page?.count ?? 0) : 0,
    loading: !current || state.loading,
    error: current ? state.error : null,
    reload,
  };
}

/** Loads subset metadata first, then optionally resolves live counts. */
export function useSavedSubset(
  datasetId: string,
  subsetId: string | undefined,
  includeCounts = false,
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
    const controller = new AbortController();
    getSubset(datasetId, subsetId)
      .then(async (subset) => {
        if (controller.signal.aborted) return;
        setState({ id: subsetId, subset, error: null });
        if (includeCounts && subset.counts === null) {
          try {
            const counted = await getSubsetCounts(
              datasetId,
              subsetId,
              controller.signal,
            );
            if (!controller.signal.aborted)
              setState({ id: subsetId, subset: counted, error: null });
          } catch {
            // Keep usable metadata when live counts are temporarily unavailable.
          }
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setState({ id: subsetId, subset: null, error: String(cause) });
      });
    return () => controller.abort();
  }, [datasetId, subsetId, revision, includeCounts]);
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
  const { fullEpisodes, segments } = subset.memberCounts;
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
