import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useCurrentDatasetId,
  useDatasetMediaType,
  useGridGroupSlice,
  useGridViewScope,
  useLegacySelectedSamples,
  useSampleSchema,
  useSetSelectionScopeBoundary,
} from "../accessors/dataset";
import {
  combineSelectionCaptures,
  countSelectionCaptures,
  createSelectionSnapshot,
  type SelectionScope,
  getSelectionAvailability,
  resolveSelection,
  resolveSelectionDetails,
  type SelectionRequest,
} from "./client";
import {
  useClearSelectionBucket,
  useRefreshSelectionMetadata,
  useSelectionBoundary,
  useSelectionBucketCaptures,
  useSelectionBucketCommands,
  useSelectionBuckets,
  useSelectionMembership,
  useSelectionScopeRevision,
  useSelectionTarget,
} from "./hooks";
import { foldWindow } from "./fold";
import {
  capturedScopeSources,
  countSelection,
  hasDynamicGroups,
  routeSelectionBucket,
  selectionDomainId,
  selectionUnit,
  viewConversion,
  type SelectionModifiers,
} from "./model";
import {
  bucketCommandAtom,
  captureErrorAtom,
  captureRequestsAtom,
  captureScopesAtom,
  candidatesAtom,
  pendingCapturesAtom,
  renderedCaptureIdsAtom,
  type CandidateState,
  type Captures,
} from "./model/atoms";
import type {
  EpisodeSelection,
  SelectionBoundary,
  SegmentConstraint,
} from "./types";

const EMPTY_GROUPS: readonly EpisodeSelection[] = [];
const EMPTY_CAPTURES: Captures = new Map();
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
    subsetViewId: conversion?.subsetId,
    unit: selectionUnit(type, kind),
    enabled: Boolean(id) && Boolean(type),
  };
}

/** Active range constraints include positive temporal-tag sidebar filters. */
export function useGridSelectionBoundary() {
  const { domainId, conversion } = useGridSelectionDataset();
  const [boundary, setBoundary] = useSelectionBoundary(domainId);
  const { filters: currentFilters, rangeConstraint } = useGridViewScope();
  const schema = useSampleSchema();
  const tags = currentFilters._temporal_tags;
  const effective = useMemo<SelectionBoundary>(() => {
    const values = Array.isArray(tags?.values)
      ? tags.values.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const providers: SegmentConstraint[] = boundary.provider
      ? [boundary.provider]
      : [];
    if (!conversion && rangeConstraint)
      providers.push(rangeConstraint.provider);
    if (!tags?.exclude && values.length)
      providers.push({ kind: "temporal-tags", values });
    if (!conversion)
      for (const [field, definition] of Object.entries(schema)) {
        if (!definition.embeddedDocType?.endsWith(".TemporalDetections"))
          continue;
        const filter = currentFilters[`${field}.detections.label`];
        const eventValues = Array.isArray(filter?.values)
          ? filter.values.filter(
              (value): value is string => typeof value === "string",
            )
          : [];
        // Both sidebar label modes identify event ranges; isMatching only
        // controls whether nonmatching parents stay in the displayed view.
        if (!filter?.exclude && eventValues.length)
          providers.push({ kind: "events", field, values: eventValues });
      }
    return providers.length
      ? {
          ...boundary,
          provider:
            providers.length === 1
              ? providers[0]
              : { kind: "intersection", providers },
        }
      : boundary;
  }, [boundary, conversion, currentFilters, rangeConstraint, schema, tags]);
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
  const conversion = viewConversion(request.view)?.kind;
  return (
    !request.boundary.provider &&
    !request.boundary.subsetId &&
    !request.expand &&
    conversion !== "frames" &&
    conversion !== "clips"
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
 * parents, plus every bucket's captures. Clicking a tile resolves only that
 * tile; nothing enumerates the whole scope in the browser.
 *
 * `selected`, `capture`, `remove`, `clear`, `select`, and `toggle` address
 * the bucket actions apply to unless a bucket id is given. The grid decides
 * the bucket for a gesture with `route`.
 */
export function useGridSelection() {
  const dataset = useGridSelectionDataset();
  const { key, request } = useGridSelectionRequest();
  const { rangeConstraint } = useGridViewScope();
  const latestScope = useRef(key);
  latestScope.current = key;
  const state = useAtomValue(candidatesAtom(dataset.domainId));
  const pendingCaptures = useAtomValue(pendingCapturesAtom(dataset.domainId));
  const setPendingCaptures = useSetAtom(pendingCapturesAtom(dataset.domainId));
  const buckets = useSelectionBuckets(dataset.datasetId);
  const captures = useSelectionBucketCaptures(dataset.domainId);
  const membership = useSelectionMembership(dataset.domainId);
  const { target, setTarget } = useSelectionTarget(dataset.domainId);
  const { removeEverywhere, clearAll } = useSelectionBucketCommands(
    dataset.domainId,
  );
  const clearBucket = useClearSelectionBucket(dataset.domainId);
  const dispatch = useSetAtom(bucketCommandAtom(dataset.domainId));
  const selected = captures.get(target) ?? EMPTY_CAPTURES;
  const current = state.key === key && !state.loading && !state.error;
  const merged = useAtomValue(captureScopesAtom(dataset.domainId));
  const setMerged = useSetAtom(captureScopesAtom(dataset.domainId));
  const sources = capturedScopeSources([...selected.values()]);
  const resolved = merged.get(target);
  const capturedState =
    resolved?.key === JSON.stringify(sources) ? resolved : undefined;
  const selectedCounts = sources.snapshotIds.length
    ? (capturedState?.counts ?? null)
    : countSelection([...selected.values()]);
  const resolveCaptured = async (): Promise<SelectionScope> => {
    if (!sources.snapshotIds.length)
      return { kind: "members", members: sources.members };
    if (capturedState?.scope) return capturedState.scope;
    const scope = await combineSelectionCaptures(dataset.datasetId, {
      ...sources,
      view: request.view,
    });
    setMerged((current) =>
      current.get(target)?.key === JSON.stringify(sources)
        ? new Map(current).set(target, {
            key: JSON.stringify(sources),
            counts: scope.counts,
            scope,
          })
        : current,
    );
    return scope;
  };
  const countsForBucket = (bucketId: string) => {
    const groups = [...(captures.get(bucketId)?.values() ?? [])];
    const input = capturedScopeSources(groups);
    if (!input.snapshotIds.length) return countSelection(groups);
    const cached = merged.get(bucketId);
    return cached?.key === JSON.stringify(input)
      ? (cached.counts ?? null)
      : null;
  };
  const captureError = useAtomValue(captureErrorAtom(dataset.domainId));
  const setCaptureError = useSetAtom(captureErrorAtom(dataset.domainId));
  const capture = useCallback(
    (
      group: EpisodeSelection,
      operation: "replace" | "add" = "replace",
      bucketId: string = target,
    ) => {
      setCaptureError(null);
      if (group.group && !group.group.snapshotId) {
        setPendingCaptures((count) => count + 1);
        void resolveSelectionDetails(dataset.datasetId, {
          ...request,
          episodeIds: [group.episodeId],
          capture: true,
        })
          .then((result) => {
            if (latestScope.current !== key) return;
            for (const captured of result.groups)
              dispatch({
                type: "capture",
                bucketId,
                group: captured,
                operation,
              });
          })
          .catch((error: unknown) => setCaptureError(String(error)))
          .finally(() => setPendingCaptures((count) => count - 1));
      } else dispatch({ type: "capture", bucketId, group, operation });
    },
    [
      dispatch,
      target,
      dataset.datasetId,
      request,
      key,
      setCaptureError,
      setPendingCaptures,
    ],
  );
  const remove = useCallback(
    (episodeId: string, bucketId: string = target) =>
      dispatch({ type: "remove", bucketId, episodeId }),
    [dispatch, target],
  );
  const clear = useCallback(
    (bucketId: string = target) => clearBucket(bucketId),
    [clearBucket, target],
  );
  const resolveCandidates = useCallback(
    async (ids: readonly string[]) => {
      if (isPlainScope(request))
        return new Map(ids.map((id) => [id, wholeParent(id)] as const));
      const result = await resolveSelectionDetails(dataset.datasetId, {
        ...request,
        episodeIds: ids,
        capture: true,
      });
      if (latestScope.current !== key)
        return new Map<string, EpisodeSelection>();
      return new Map(
        result.groups.map((group) => [group.episodeId, group] as const),
      );
    },
    [dataset.datasetId, request, key],
  );
  const select = useCallback(
    async (ids: readonly string[], bucketId: string = target) => {
      const bucket = captures.get(bucketId);
      const fresh = ids.filter((id) => !bucket?.has(id));
      if (!fresh.length) return;
      setCaptureError(null);
      setPendingCaptures((count) => count + 1);
      try {
        for (const group of (await resolveCandidates(fresh)).values())
          dispatch({ type: "capture", bucketId, group });
      } catch (error) {
        setCaptureError(String(error));
      } finally {
        setPendingCaptures((count) => count - 1);
      }
    },
    [
      captures,
      target,
      resolveCandidates,
      dispatch,
      setCaptureError,
      setPendingCaptures,
    ],
  );
  const toggle = useCallback(
    async (id: string, bucketId: string = target) => {
      if (captures.get(bucketId)?.has(id))
        dispatch({ type: "remove", bucketId, episodeId: id });
      else await select([id], bucketId);
    },
    [captures, target, dispatch, select],
  );
  const route = useCallback(
    (modifiers: SelectionModifiers) => routeSelectionBucket(modifiers, buckets),
    [buckets],
  );
  const snapshot = useCallback(
    (signal?: AbortSignal) =>
      createSelectionSnapshot(dataset.datasetId, request, signal),
    [dataset.datasetId, request],
  );
  return {
    ...dataset,
    scopeKey: key,
    buckets,
    target,
    setTarget,
    captures,
    membership,
    route,
    capture,
    remove,
    removeEverywhere,
    clear,
    clearAll,
    select,
    toggle,
    snapshot,
    selected,
    selectedCounts,
    resolveCaptured,
    countsForBucket,
    capturedError: captureError ?? capturedState?.error ?? null,
    pendingCaptures: pendingCaptures > 0,
    candidates: current ? state.candidates : NO_CANDIDATES,
    counts: current ? state.counts : null,
    unavailableTotal: current ? state.unavailableTotal : undefined,
    loadUnavailable: (skip: number) =>
      resolveSelection(dataset.datasetId, {
        ...request,
        unavailableSkip: skip,
      }),
    unavailableGroups:
      state.key === key
        ? (state.unavailableGroups ?? EMPTY_GROUPS)
        : EMPTY_GROUPS,
    request,
    retryRangeCapture: !dataset.conversion ? rangeConstraint?.retry : undefined,
    loading:
      (!dataset.conversion && rangeConstraint?.pending) ||
      state.key !== key ||
      state.loading,
    error:
      (!dataset.conversion ? rangeConstraint?.error : undefined) ??
      (state.key === key ? state.error : null),
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
 * parents the strips render. A folded strip shows its two ends, so a
 * thousand captures never turn into a thousand-parent details request.
 */
export function useLoadGridSelection() {
  const { datasetId: id, domainId, enabled } = useGridSelectionDataset();
  const { request, key } = useGridSelectionRequest();
  const { refresh } = useGridViewScope();
  const set = useSetAtom(candidatesAtom(domainId));
  const state = useAtomValue(candidatesAtom(domainId));
  const selectedIds = JSON.stringify(
    useAtomValue(renderedCaptureIdsAtom(domainId)),
  );
  const latestSelected = useRef(selectedIds);
  latestSelected.current = selectedIds;
  const refreshMetadata = useRefreshSelectionMetadata(domainId);
  const stages = request.view;
  const capturedView = useRef(stages);
  capturedView.current = stages;
  const captureRequests = useAtomValue(captureRequestsAtom(domainId));
  const setCaptures = useSetAtom(captureScopesAtom(domainId));
  const mergedCaptures = useAtomValue(captureScopesAtom(domainId));
  const latestCaptures = useRef(mergedCaptures);
  latestCaptures.current = mergedCaptures;
  const captureRevision = useSelectionScopeRevision(id);
  // This effect counts frozen unions when a bucket's membership changes.
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const requests = JSON.parse(captureRequests) as [
      string,
      ReturnType<typeof capturedScopeSources>,
    ][];
    for (const [bucketId, sources] of requests) {
      if (!sources.snapshotIds.length) continue;
      const captureKey = JSON.stringify(sources);
      const cached = latestCaptures.current.get(bucketId);
      if (cached?.key === captureKey && cached.counts) continue;
      countSelectionCaptures(
        id,
        { ...sources, view: capturedView.current },
        controller.signal,
      )
        .then((counts) => {
          if (!controller.signal.aborted)
            setCaptures((current) =>
              new Map(current).set(bucketId, { key: captureKey, counts }),
            );
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setCaptures((current) =>
              new Map(current).set(bucketId, {
                key: captureKey,
                error: String(error),
              }),
            );
        });
    }
    return () => controller.abort();
  }, [id, enabled, captureRequests, captureRevision, setCaptures]);
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
              unavailableTotal: result.unavailableTotal,
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
    resolveSelectionDetails(
      id,
      { ...request, episodeIds: missing },
      controller.signal,
    )
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
  const { domainId, enabled } = useGridSelectionDataset();
  const [boundary] = useGridSelectionBoundary();
  const setScope = useSetSelectionScopeBoundary();
  // This effect mirrors the boundary whenever it changes.
  useEffect(() => {
    setScope(enabled ? { domainId, boundary } : null);
  }, [domainId, enabled, boundary, setScope]);
  // This effect withdraws the boundary when the grid unmounts.
  useEffect(() => () => setScope(null), [setScope]);
}

/**
 * Mount once in the grid. Keeps the legacy selected-samples session and the
 * tray captures in step, so lookers, the modal, operators, and saved views
 * all see the one selection the tray shows. The legacy session holds the
 * union of every bucket; a parent it adds lands in the first bucket, and a
 * parent it drops leaves every bucket.
 */
export function useSyncLegacySelection() {
  const { datasetId, domainId: id, enabled } = useGridSelectionDataset();
  const { key, request } = useGridSelectionRequest();
  const membership = useSelectionMembership(id);
  const buckets = useSelectionBuckets(datasetId);
  const dispatch = useSetAtom(bucketCommandAtom(id));
  const state = useAtomValue(candidatesAtom(id));
  const [legacy, setLegacy] = useLegacySelectedSamples();
  const previous = useRef<{ tray: string[]; legacy: string[] } | null>(null);
  const [verified, setVerified] = useState<{
    key: string;
    ids: ReadonlySet<string>;
  } | null>(null);
  const trayIds = useMemo(() => [...membership.keys()].sort(), [membership]);
  const legacyIds = useMemo(() => [...legacy.keys()].sort(), [legacy]);
  const firstBucket = buckets[0].id;
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
    resolveSelectionDetails(
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
    if (!enabled) return undefined;
    const plan = reconcileSelection(
      previous.current,
      trayIds,
      legacyIds,
      verified?.key === key ? verified.ids : null,
    );
    if (plan.kind === "wait") return undefined;
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
      return undefined;
    }
    if (plan.kind === "adopt") {
      const apply = (groups: readonly EpisodeSelection[]) => {
        for (const sampleId of plan.remove)
          dispatch({ type: "remove-everywhere", episodeId: sampleId });
        for (const group of groups)
          dispatch({ type: "capture", bucketId: firstBucket, group });
        const captured = new Set(groups.map((group) => group.episodeId));
        const requested = new Set(plan.capture);
        const ids = legacyIds.filter(
          (id) => !requested.has(id) || captured.has(id),
        );
        if (ids.length !== legacyIds.length)
          setLegacy(
            new Map(ids.map((id) => [id, legacy.get(id) ?? "default"])),
          );
        previous.current = { tray: ids, legacy: ids };
      };
      if (!isPlainScope(request)) {
        // Modal and operator selections supply row IDs. Resolve their durable
        // references just as a grid click does before adopting them.
        const controller = new AbortController();
        resolveSelectionDetails(
          datasetId,
          { ...request, episodeIds: plan.capture, capture: true },
          controller.signal,
        )
          .then((result) => {
            if (!controller.signal.aborted) apply(result.groups);
          })
          .catch(() => {
            /* Preserve the current selection when resolution fails. */
          });
        return () => controller.abort();
      }
      apply(
        plan.capture.map((id) => state.candidates.get(id) ?? wholeParent(id)),
      );
      return undefined;
    }
    previous.current = { tray: trayIds, legacy: legacyIds };
    return undefined;
  }, [
    enabled,
    key,
    trayIds,
    legacyIds,
    legacy,
    verified,
    state.candidates,
    firstBucket,
    dispatch,
    setLegacy,
    datasetId,
    request,
  ]);
}
