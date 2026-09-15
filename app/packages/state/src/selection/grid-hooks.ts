import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import {
  useCurrentDatasetId,
  useDatasetMediaType,
  useGridViewScope,
  useIsConvertedView,
} from "../accessors/dataset";
import {
  getSelectionAvailability,
  resolveSelection,
  type SelectionRequest,
} from "./client";
import {
  useEpisodeSelection,
  useEpisodeSelectionActions,
  useSelectionBoundary,
  useSelectionScopeRevision,
  useRefreshSelectionMetadata,
} from "./hooks";
import { candidatesAtom } from "./model/atoms";
import type { EpisodeSelection, SelectionBoundary } from "./types";

const EMPTY_GROUPS: readonly EpisodeSelection[] = [];

/** Current dataset identity and supported grid media. */
export function useGridSelectionDataset() {
  const id = useCurrentDatasetId() ?? "";
  const type = useDatasetMediaType() ?? "";
  const converted = useIsConvertedView();
  const [boundary] = useSelectionBoundary(id);
  return {
    datasetId: id,
    mediaType: type,
    enabled:
      Boolean(id) &&
      ["video", "multimodal"].includes(type) &&
      (!converted || Boolean(boundary.subsetId)),
  };
}

/** Active range constraints include positive temporal-tag sidebar filters. */
export function useGridSelectionBoundary() {
  const { datasetId: id } = useGridSelectionDataset();
  const [boundary, setBoundary] = useSelectionBoundary(id);
  const { filters: currentFilters } = useGridViewScope();
  const tags = currentFilters._temporal_tags;
  const values = Array.isArray(tags?.values)
    ? tags.values.filter((value): value is string => typeof value === "string")
    : [];
  const effective: SelectionBoundary =
    !boundary.provider && !tags?.exclude && values.length
      ? { ...boundary, provider: { kind: "temporal-tags", values } }
      : boundary;
  return [effective, setBoundary] as const;
}

/** Capturable request preserves the current pipeline and provider boundary. */
export function useGridSelectionRequest() {
  const [boundary] = useGridSelectionBoundary();
  const {
    view: stages,
    filters: currentFilters,
    extendedStages: extended,
    sort,
  } = useGridViewScope();
  const request: SelectionRequest = {
    view: stages ?? [],
    filters: currentFilters,
    extendedStages: extended,
    boundary,
    sortBy: sort?.field,
    desc: sort?.descending,
  };
  const serialized = JSON.stringify(request);
  const { datasetId } = useGridSelectionDataset();
  const revision = useSelectionScopeRevision(datasetId);
  return useMemo(
    () => ({
      request: JSON.parse(serialized) as SelectionRequest,
      key: `${revision}:${serialized}`,
    }),
    [serialized, revision],
  );
}

/** Reads only current candidates; an old response never becomes a new scope. */
export function useGridSelection() {
  const dataset = useGridSelectionDataset();
  const { key, request } = useGridSelectionRequest();
  const state = useAtomValue(candidatesAtom(dataset.datasetId));
  const selected = useEpisodeSelection(dataset.datasetId);
  const { capture, remove, clear } = useEpisodeSelectionActions(
    dataset.datasetId,
  );
  const groups =
    state.key === key && !state.loading && !state.error
      ? state.groups
      : EMPTY_GROUPS;
  const candidates = useMemo(
    () => new Map(groups.map((group) => [group.episodeId, group])),
    [groups],
  );
  const toggle = useCallback(
    (id: string) => {
      if (selected.has(id)) remove(id);
      else {
        const candidate = candidates.get(id);
        if (candidate) capture(candidate);
      }
    },
    [selected, candidates, capture, remove],
  );
  return {
    ...dataset,
    capture,
    remove,
    clear,
    selected,
    candidates,
    groups,
    unavailableGroups:
      state.key === key
        ? (state.unavailableGroups ?? EMPTY_GROUPS)
        : EMPTY_GROUPS,
    toggle,
    request,
    loading: state.key !== key || state.loading,
    error: state.key === key ? state.error : null,
  };
}

/** Mount once in the grid to resolve complete candidates on scope changes. */
export function useLoadGridSelection() {
  const { datasetId: id, enabled } = useGridSelectionDataset();
  const { request, key } = useGridSelectionRequest();
  const { refresh } = useGridViewScope();
  const set = useSetAtom(candidatesAtom(id));
  const selected = useEpisodeSelection(id);
  const selectedIds = JSON.stringify([...selected.keys()].sort());
  const refreshMetadata = useRefreshSelectionMetadata(id);
  // This effect checks live parent availability independently of the current results.
  useEffect(() => {
    if (!enabled || selectedIds === "[]") return undefined;
    const controller = new AbortController();
    getSelectionAvailability(id, JSON.parse(selectedIds), controller.signal)
      .then((metadata) => {
        if (!controller.signal.aborted) refreshMetadata(metadata);
      })
      .catch(() => {
        /* Keep the last known metadata when its refresh is unavailable. */
      });
    return () => controller.abort();
  }, [id, enabled, selectedIds, refresh, key, refreshMetadata]);
  // This effect owns candidate resolution; captures live in a separate atom.
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    set({ key, groups: [], loading: true, error: null });
    resolveSelection(id, request, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted)
          set({
            key,
            groups: result.groups,
            unavailableGroups: result.unavailableGroups,
            loading: false,
            error: null,
          });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          set({
            key,
            groups: [],
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          });
      });
    return () => {
      controller.abort();
    };
  }, [id, enabled, key, request, refresh, set]);
}

/** Keeps a failed scoped page inside the tray so users can change its boundary. */
export function useGridSelectionPagingError() {
  const { datasetId } = useGridSelectionDataset();
  const { key } = useGridSelectionRequest();
  const set = useSetAtom(candidatesAtom(datasetId));
  return useCallback(
    (error: unknown) =>
      set((current) =>
        current.key === key
          ? { ...current, groups: [], loading: false, error: String(error) }
          : current,
      ),
    [key, set],
  );
}
