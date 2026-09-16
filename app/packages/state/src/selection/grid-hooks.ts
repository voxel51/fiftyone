import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useCurrentDatasetId,
  useDatasetMediaType,
  useGridViewScope,
  useLegacySelectedSamples,
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
import { selectionDomainId, selectionUnit, viewConversion } from "./model";
import { candidatesAtom } from "./model/atoms";
import type { EpisodeSelection, SelectionBoundary } from "./types";

const EMPTY_GROUPS: readonly EpisodeSelection[] = [];

/** Current dataset identity and supported grid media. */
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
    enabled: Boolean(id) && Boolean(type) && type !== "group",
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
  const state = useAtomValue(candidatesAtom(dataset.domainId));
  const selected = useEpisodeSelection(dataset.domainId);
  const { capture, remove, clear } = useEpisodeSelectionActions(
    dataset.domainId,
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
  const { datasetId: id, domainId, enabled } = useGridSelectionDataset();
  const { request, key } = useGridSelectionRequest();
  const { refresh } = useGridViewScope();
  const set = useSetAtom(candidatesAtom(domainId));
  const selected = useEpisodeSelection(domainId);
  const selectedIds = JSON.stringify([...selected.keys()].sort());
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
  const { domainId } = useGridSelectionDataset();
  const { key } = useGridSelectionRequest();
  const set = useSetAtom(candidatesAtom(domainId));
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
 * Mount once in the grid. Keeps the legacy selected-samples session and the
 * tray captures in step, so lookers, the modal, operators, and saved views
 * all see the one selection the tray shows.
 */
export function useSyncLegacySelection() {
  const { domainId: id, enabled } = useGridSelectionDataset();
  const { key } = useGridSelectionRequest();
  const selected = useEpisodeSelection(id);
  const { capture, remove } = useEpisodeSelectionActions(id);
  const candidates = useAtomValue(candidatesAtom(id));
  const [legacy, setLegacy] = useLegacySelectedSamples();
  const previous = useRef<{ tray: string[]; legacy: string[] } | null>(null);
  const trayIds = useMemo(() => [...selected.keys()].sort(), [selected]);
  const legacyIds = useMemo(() => [...legacy.keys()].sort(), [legacy]);
  // This effect forgets the last agreement when the dataset changes so a
  // stale selection from another dataset is never adopted.
  useEffect(() => {
    previous.current = null;
  }, [id]);
  // This effect reconciles the two selection stores after either one changes.
  useEffect(() => {
    if (!enabled) return;
    const settled = candidates.key === key && !candidates.loading;
    const plan = reconcileSelection(
      previous.current,
      trayIds,
      legacyIds,
      settled
        ? new Set(candidates.groups.map((group) => group.episodeId))
        : null,
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
      const groups = new Map(
        candidates.groups.map((group) => [group.episodeId, group]),
      );
      for (const sampleId of plan.remove) remove(sampleId);
      for (const sampleId of plan.capture)
        capture(
          groups.get(sampleId) ?? {
            episodeId: sampleId,
            members: [{ episodeId: sampleId, kind: "episode" }],
          },
        );
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
    candidates,
    capture,
    remove,
    setLegacy,
  ]);
}
