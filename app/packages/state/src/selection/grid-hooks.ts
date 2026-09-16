import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useCurrentDatasetId,
  useDatasetMediaType,
  useGridGroupSlice,
  useGridViewScope,
  useLegacySelectedSamples,
  useSetSelectionScopeBoundary,
} from "../accessors/dataset";
import {
  createSelectionSnapshot,
  getSelectionAvailability,
  resolveSelection,
  type SelectionRequest,
} from "./client";
import {
  useEpisodeSelection,
  useEpisodeSelectionActions,
  useFoldRevealed,
  useSelectionBoundary,
  useSelectionScopeRevision,
  useRefreshSelectionMetadata,
} from "./hooks";
import { foldWindow } from "./fold";
import {
  hasDynamicGroups,
  selectionDomainId,
  selectionUnit,
  viewConversion,
} from "./model";
import { candidatesAtom, type CandidateState } from "./model/atoms";
import type { EpisodeSelection, SelectionBoundary } from "./types";

const EMPTY_GROUPS: readonly EpisodeSelection[] = [];
const NO_CANDIDATES: ReadonlyMap<string, EpisodeSelection | null> = new Map();

/** Current dataset identity, selection domain, and vocabulary. */
export function useGridSelectionDataset() {
  const id = useCurrentDatasetId() ?? "";
  const type = useDatasetMediaType() ?? "";
  const { view } = useGridViewScope();
  const conversion = useMemo(() => viewConversion(view ?? []), [view]);
  const kind = conversion?.kind ?? null;
  return {
    datasetId: id,
    /** Captures are isolated per dataset and, in converted views, per conversion. */
    domainId: selectionDomainId(id, conversion?.key ?? null),
    mediaType: type,
    conversion: kind,
    unit: selectionUnit(type, kind),
    enabled: Boolean(id) && Boolean(type),
  };
}

/** Active range constraints include positive temporal-tag sidebar filters. */
export function useGridSelectionBoundary() {
  const { domainId } = useGridSelectionDataset();
  const [boundary, setBoundary] = useSelectionBoundary(domainId);
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

/** Capturable request: the pipeline, provider boundary, and active slice. */
export function useGridSelectionRequest() {
  const [boundary] = useGridSelectionBoundary();
  const {
    view: stages,
    filters: currentFilters,
    extendedStages: extended,
    sort,
  } = useGridViewScope();
  const slice = useGridGroupSlice();
  const request: SelectionRequest = {
    view: stages ?? [],
    filters: currentFilters,
    extendedStages: extended,
    boundary,
    sortBy: sort?.field,
    desc: sort?.descending,
    slice: slice ?? undefined,
    expand: hasDynamicGroups(stages ?? []) ? "dynamic-groups" : undefined,
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

/** Whole-parent scopes describe a clicked tile without a server round trip. */
export function isPlainScope(request: SelectionRequest) {
  return (
    !request.boundary.provider && !request.boundary.subsetId && !request.expand
  );
}

function wholeParent(id: string): EpisodeSelection {
  return { episodeId: id, members: [{ episodeId: id, kind: "episode" }] };
}

function withCandidates(
  state: CandidateState,
  ids: readonly string[],
  groups: readonly EpisodeSelection[],
): CandidateState {
  const candidates = new Map(state.candidates);
  for (const id of ids) candidates.set(id, null);
  for (const group of groups) candidates.set(group.episodeId, group);
  return { ...state, candidates };
}

/**
 * Reads the scope's exact counts and the details fetched for captured
 * parents. Clicking a tile resolves only that tile; nothing enumerates the
 * whole scope in the browser.
 */
export function useGridSelection() {
  const dataset = useGridSelectionDataset();
  const { key, request } = useGridSelectionRequest();
  const state = useAtomValue(candidatesAtom(dataset.domainId));
  const selected = useEpisodeSelection(dataset.domainId);
  const { capture, remove, clear } = useEpisodeSelectionActions(
    dataset.domainId,
  );
  const current = state.key === key && !state.loading && !state.error;
  const resolveCandidates = useCallback(
    async (ids: readonly string[]) => {
      if (isPlainScope(request))
        return new Map(ids.map((id) => [id, wholeParent(id)] as const));
      const result = await resolveSelection(dataset.datasetId, {
        ...request,
        episodeIds: ids,
      });
      return new Map(
        result.groups.map((group) => [group.episodeId, group] as const),
      );
    },
    [dataset.datasetId, request],
  );
  const select = useCallback(
    async (ids: readonly string[]) => {
      const fresh = ids.filter((id) => !selected.has(id));
      if (!fresh.length) return;
      for (const group of (await resolveCandidates(fresh)).values())
        capture(group);
    },
    [selected, resolveCandidates, capture],
  );
  const toggle = useCallback(
    async (id: string) => {
      if (selected.has(id)) remove(id);
      else await select([id]);
    },
    [selected, remove, select],
  );
  const snapshot = useCallback(
    (signal?: AbortSignal) =>
      createSelectionSnapshot(dataset.datasetId, request, signal),
    [dataset.datasetId, request],
  );
  return {
    ...dataset,
    capture,
    remove,
    clear,
    select,
    toggle,
    snapshot,
    selected,
    candidates: current ? state.candidates : NO_CANDIDATES,
    counts: current ? state.counts : null,
    unavailableGroups:
      state.key === key
        ? (state.unavailableGroups ?? EMPTY_GROUPS)
        : EMPTY_GROUPS,
    request,
    loading: state.key !== key || state.loading,
    error: state.key === key ? state.error : null,
  };
}

/** The captured parents a strip renders: all of them, or a folded strip's two ends. */
export function renderedCaptures(
  selected: ReadonlyMap<string, EpisodeSelection>,
  revealed: number,
) {
  const ids = [...selected.keys()];
  const { head, hidden, tail } = foldWindow(ids, revealed);
  return hidden ? [...head, ...tail] : ids;
}

/**
 * Mount once in the grid: counts per scope, details only for the captured
 * parents the strip renders. A folded strip shows its two ends, so a
 * thousand captures never turn into a thousand-parent details request.
 */
export function useLoadGridSelection() {
  const { datasetId: id, domainId, enabled } = useGridSelectionDataset();
  const { request, key } = useGridSelectionRequest();
  const { refresh } = useGridViewScope();
  const set = useSetAtom(candidatesAtom(domainId));
  const state = useAtomValue(candidatesAtom(domainId));
  const selected = useEpisodeSelection(domainId);
  const { revealed } = useFoldRevealed(domainId);
  const selectedIds = JSON.stringify(
    renderedCaptures(selected, revealed).sort(),
  );
  const latestSelected = useRef(selectedIds);
  latestSelected.current = selectedIds;
  const refreshMetadata = useRefreshSelectionMetadata(domainId);
  const stages = request.view;
  // This effect checks live parent availability independently of the current results.
  useEffect(() => {
    if (!enabled || selectedIds === "[]") return undefined;
    const controller = new AbortController();
    getSelectionAvailability(
      id,
      JSON.parse(selectedIds),
      controller.signal,
      stages,
    )
      .then((metadata) => {
        if (!controller.signal.aborted) refreshMetadata(metadata);
      })
      .catch(() => {
        /* Keep the last known metadata when its refresh is unavailable. */
      });
    return () => controller.abort();
  }, [id, enabled, selectedIds, refresh, key, refreshMetadata, stages]);
  // This effect counts the scope and describes the captured parents whenever
  // the scope changes. It never enumerates every member for the browser.
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const ids: string[] = JSON.parse(latestSelected.current);
    set({
      key,
      counts: null,
      candidates: new Map(),
      loading: true,
      error: null,
    });
    resolveSelection(id, { ...request, episodeIds: ids }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        set(
          withCandidates(
            {
              key,
              counts: result.counts,
              unavailableGroups: result.unavailableGroups,
              candidates: new Map(),
              loading: false,
              error: null,
            },
            ids,
            result.groups,
          ),
        );
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          set({
            key,
            counts: null,
            candidates: new Map(),
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          });
      });
    return () => {
      controller.abort();
    };
  }, [id, enabled, key, request, refresh, set]);
  // This effect describes parents captured after the scope resolved, without
  // recounting the scope.
  useEffect(() => {
    if (!enabled || state.key !== key || state.loading || state.error)
      return undefined;
    const missing = (JSON.parse(selectedIds) as string[]).filter(
      (sampleId) => !state.candidates.has(sampleId),
    );
    if (!missing.length) return undefined;
    const controller = new AbortController();
    resolveSelection(id, { ...request, episodeIds: missing }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted)
          set((current) =>
            current.key === key
              ? withCandidates(current, missing, result.groups)
              : current,
          );
      })
      .catch(() => {
        /* Details are advisory; the next scope change retries. */
      });
    return () => controller.abort();
  }, [enabled, id, key, request, selectedIds, state, set]);
}

/** Keeps a failed scoped page inside the tray so users can change its boundary. */
export function useGridSelectionPagingError() {
  const { domainId } = useGridSelectionDataset();
  const { key } = useGridSelectionRequest();
  const set = useSetAtom(candidatesAtom(domainId));
  return useCallback(
    (error: unknown) =>
      set((current) =>
        current.key === key
          ? { ...current, counts: null, loading: false, error: String(error) }
          : current,
      ),
    [key, set],
  );
}

/** What the legacy selected-samples session and the tray should do to agree. */
export type SelectionSyncPlan =
  | { readonly kind: "none" }
  | { readonly kind: "wait" }
  | { readonly kind: "push"; readonly ids: readonly string[] }
  | {
      readonly kind: "adopt";
      readonly capture: readonly string[];
      readonly remove: readonly string[];
    };

function sameIds(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

/**
 * Decide which side wins when the tray and the legacy selection disagree.
 * Both id lists must be sorted. The tray wins whenever it changed; a change
 * that came only from the legacy side (modal checkbox, operators, Escape) is
 * adopted into the tray. On first sight, an empty tray adopts a legacy
 * selection only once every id is known to belong to this dataset's results.
 */
export function reconcileSelection(
  previous: { tray: readonly string[]; legacy: readonly string[] } | null,
  tray: readonly string[],
  legacy: readonly string[],
  known: ReadonlySet<string> | null,
): SelectionSyncPlan {
  if (sameIds(tray, legacy)) return { kind: "none" };
  if (previous === null) {
    if (tray.length || !legacy.length) return { kind: "push", ids: tray };
    if (known === null) return { kind: "wait" };
    return legacy.every((id) => known.has(id))
      ? { kind: "adopt", capture: legacy, remove: [] }
      : { kind: "push", ids: tray };
  }
  const trayChanged = !sameIds(previous.tray, tray);
  const legacyChanged = !sameIds(previous.legacy, legacy);
  if (trayChanged || !legacyChanged) return { kind: "push", ids: tray };
  const trayIds = new Set(tray);
  const legacyIds = new Set(legacy);
  return {
    kind: "adopt",
    capture: legacy.filter((id) => !trayIds.has(id)),
    remove: tray.filter((id) => !legacyIds.has(id)),
  };
}

/**
 * Mount once in the grid. Publishes the tray's browsing boundary to the
 * legacy session so view-scoped queries (entry counts, sidebar counts)
 * describe the same scope the grid pages do.
 */
export function useSyncSelectionScope() {
  const { enabled } = useGridSelectionDataset();
  const [boundary] = useGridSelectionBoundary();
  const setScope = useSetSelectionScopeBoundary();
  // This effect mirrors the boundary whenever it changes.
  useEffect(() => {
    setScope(enabled ? boundary : null);
  }, [enabled, boundary, setScope]);
  // This effect withdraws the boundary when the grid unmounts.
  useEffect(() => () => setScope(null), [setScope]);
}

/**
 * Mount once in the grid. Keeps the legacy selected-samples session and the
 * tray captures in step, so lookers, the modal, operators, and saved views
 * all see the one selection the tray shows.
 */
export function useSyncLegacySelection() {
  const { datasetId, domainId: id, enabled } = useGridSelectionDataset();
  const { key, request } = useGridSelectionRequest();
  const selected = useEpisodeSelection(id);
  const { capture, remove } = useEpisodeSelectionActions(id);
  const state = useAtomValue(candidatesAtom(id));
  const [legacy, setLegacy] = useLegacySelectedSamples();
  const previous = useRef<{ tray: string[]; legacy: string[] } | null>(null);
  const [verified, setVerified] = useState<{
    key: string;
    ids: ReadonlySet<string>;
  } | null>(null);
  const trayIds = useMemo(() => [...selected.keys()].sort(), [selected]);
  const legacyIds = useMemo(() => [...legacy.keys()].sort(), [legacy]);
  // This effect forgets the last agreement when the domain changes so a
  // stale selection from another dataset or view is never adopted.
  useEffect(() => {
    previous.current = null;
    setVerified(null);
  }, [id]);
  // This effect confirms, once per scope, that a legacy selection seen at
  // first sight belongs to this scope before the tray adopts it.
  useEffect(() => {
    if (!enabled || previous.current !== null) return undefined;
    if (trayIds.length || !legacyIds.length || verified?.key === key)
      return undefined;
    const controller = new AbortController();
    resolveSelection(
      datasetId,
      { ...request, episodeIds: legacyIds },
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted)
          setVerified({
            key,
            ids: new Set(result.groups.map((group) => group.episodeId)),
          });
      })
      .catch(() => {
        if (!controller.signal.aborted) setVerified({ key, ids: new Set() });
      });
    return () => controller.abort();
  }, [enabled, datasetId, key, request, trayIds, legacyIds, verified]);
  // This effect reconciles the two selection stores after either one changes.
  useEffect(() => {
    if (!enabled) return;
    const plan = reconcileSelection(
      previous.current,
      trayIds,
      legacyIds,
      verified?.key === key ? verified.ids : null,
    );
    if (plan.kind === "wait") return;
    if (plan.kind === "push") {
      setLegacy(
        new Map(
          plan.ids.map((sampleId) => [
            sampleId,
            legacy.get(sampleId) ?? "default",
          ]),
        ),
      );
      previous.current = { tray: trayIds, legacy: [...plan.ids] };
      return;
    }
    if (plan.kind === "adopt") {
      for (const sampleId of plan.remove) remove(sampleId);
      for (const sampleId of plan.capture)
        capture(state.candidates.get(sampleId) ?? wholeParent(sampleId));
      previous.current = { tray: legacyIds, legacy: legacyIds };
      return;
    }
    previous.current = { tray: trayIds, legacy: legacyIds };
  }, [
    enabled,
    key,
    trayIds,
    legacyIds,
    legacy,
    verified,
    state.candidates,
    capture,
    remove,
    setLegacy,
  ]);
}
