import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import {
  CloneConfig,
  RunStatus,
  SimilaritySearchViewProps,
  SimilarityRun,
} from "../types";
import { useNavigate } from "./useNavigate";
import { useRuns } from "./useRuns";
import { useFilteredRuns } from "./useFilteredRuns";
import { useMultiSelect } from "./useMultiSelect";
import { useCloneConfig } from "./useCloneConfig";
import useTriggers, { TriggerOptions } from "./useTriggers";

// ─── Derived State ──────────────────────────────────────────────────

/**
 * Derives all read-only state for the similarity search panel
 * from sub-hooks and panel data: brain keys, runs, filtering,
 * patches view detection, and current user.
 */
const useDerivedPanelState = (props: SimilaritySearchViewProps) => {
  const { data: panelData = {} } = props;

  const {
    runs: allRuns,
    loaded,
    refreshRuns,
    removeRun,
    removeRuns,
  } = useRuns();
  const [submitting, setSubmitting] = useState(false);

  const allBrainKeys = useMemo(
    () => panelData.brain_keys ?? [],
    [panelData.brain_keys]
  );
  const appliedRunId = (panelData as Record<string, unknown>).applied_run_id as
    | string
    | undefined;
  const sampleMedia: Record<string, string> =
    ((panelData as Record<string, unknown>).sample_media as Record<
      string,
      string
    >) ?? {};

  // Detect patches view and filter brain keys accordingly
  const isPatchesView = useRecoilValue(fos.isPatchesView);
  const viewStages = useRecoilValue(fos.view);

  const patchesField = useMemo(() => {
    if (!isPatchesView) return undefined;
    const stage = (viewStages as any[])?.find(
      (s: any) => s._cls === "fiftyone.core.stages.ToPatches"
    );
    if (!stage) return undefined;
    return stage.kwargs?.find(
      ([k]: [string, unknown]) => k === "field"
    )?.[1] as string | undefined;
  }, [isPatchesView, viewStages]);

  const brainKeys = useMemo(() => {
    if (isPatchesView) {
      return allBrainKeys.filter((bk) => bk.patches_field === patchesField);
    }
    return allBrainKeys.filter((bk) => !bk.patches_field);
  }, [allBrainKeys, isPatchesView, patchesField]);

  // Filter runs to only those whose brain_key is in the effective set
  const effectiveBrainKeySet = useMemo(
    () => new Set(brainKeys.map((bk) => bk.key)),
    [brainKeys]
  );
  const runs = useMemo(
    () => allRuns.filter((r) => effectiveBrainKeySet.has(r.brain_key)),
    [allRuns, effectiveBrainKeySet]
  );

  // currentUser is null in OSS, populated by FOE via panel data
  const currentUser =
    ((panelData as Record<string, unknown>).current_user as string) ?? null;
  const canManage = Boolean(
    (panelData as Record<string, unknown>).can_manage ?? true
  );
  const isReadOnly = useRecoilValue(fos.readOnly) as boolean;

  // Only show All|Mine toggle for users with manage permissions
  const canFilterByOwner = !!currentUser && canManage;
  const { filteredRuns, filterState, setFilterState } = useFilteredRuns(runs);

  return {
    loaded: loaded && !submitting,
    runs,
    allRuns,
    filteredRuns,
    brainKeys,
    isPatchesView,
    appliedRunId,
    sampleMedia,
    filterState,
    canFilterByOwner,
    isReadOnly,
    refreshRuns,
    removeRun,
    removeRuns,
    setFilterState,
    submitting,
    setSubmitting,
  };
};

// ─── Actions ────────────────────────────────────────────────────────

type PanelActionsDeps = {
  runs: SimilarityRun[];
  refreshRuns: () => Promise<void>;
  removeRun: (runId: string) => void;
  removeRuns: (runIds: string[]) => void;
  setSubmitting: (v: boolean) => void;
  navigateHome: () => void;
  navigateNewSearch: () => void;
  triggers: {
    applyRun: (payload: { run_id: string }, options?: TriggerOptions) => void;
    deleteRun: (payload: { run_id: string }, options?: TriggerOptions) => void;
    bulkDeleteRuns: (
      payload: { run_ids: string[] },
      options?: TriggerOptions
    ) => void;
    renameRun: (
      payload: { run_id: string; new_name: string },
      options?: TriggerOptions
    ) => void;
  };
  setCloneConfig: (config: CloneConfig) => void;
  clearCloneConfig: () => void;
  clearAndExit: () => void;
};

/**
 * All action handlers (commands) for the similarity search panel.
 */
const useSimilarityPanelActions = (deps: PanelActionsDeps) => {
  const {
    runs,
    refreshRuns,
    removeRun,
    removeRuns,
    setSubmitting,
    navigateHome,
    navigateNewSearch,
    triggers,
    setCloneConfig,
    clearCloneConfig,
    clearAndExit,
  } = deps;

  const handleApply = useCallback(
    (runId: string) => {
      triggers.applyRun({ run_id: runId });
    },
    [triggers]
  );

  const handleDelete = useCallback(
    (runId: string) => {
      // Optimistic remove; on backend failure we re-sync from truth.
      removeRun(runId);
      triggers.deleteRun(
        { run_id: runId },
        {
          onSettled: (result) => {
            if (result?.error) {
              console.error(
                "Delete run failed; reconciling from server:",
                result.error
              );
              refreshRuns();
            }
          },
        }
      );
    },
    [triggers, removeRun, refreshRuns]
  );

  const handleBulkDelete = useCallback(
    (runIds: string[]) => {
      // Optimistic remove; on backend failure we re-sync from truth.
      removeRuns(runIds);
      clearAndExit();
      triggers.bulkDeleteRuns(
        { run_ids: runIds },
        {
          onSettled: (result) => {
            if (result?.error) {
              console.error(
                "Bulk delete failed; reconciling from server:",
                result.error
              );
              refreshRuns();
            }
          },
        }
      );
    },
    [triggers, removeRuns, clearAndExit, refreshRuns]
  );

  const handleClone = useCallback(
    (runId: string) => {
      const run = runs.find((r) => r.run_id === runId);
      if (!run) return;
      setCloneConfig({
        brain_key: run.brain_key,
        query_type: run.query_type,
        query: typeof run.query === "string" ? run.query : undefined,
        k: run.k,
        reverse: run.reverse,
        dist_field: run.dist_field,
      });
      navigateNewSearch();
    },
    [runs, setCloneConfig, navigateNewSearch]
  );

  const handleRename = useCallback(
    (runId: string, newName: string) => {
      triggers.renameRun({ run_id: runId, new_name: newName });
    },
    [triggers]
  );

  const handleNewSearch = useCallback(() => {
    clearCloneConfig();
    navigateNewSearch();
  }, [clearCloneConfig, navigateNewSearch]);

  const handleSubmitted = useCallback(async () => {
    setSubmitting(true);
    try {
      await refreshRuns();
    } finally {
      setSubmitting(false);
      navigateHome();
    }
  }, [navigateHome, refreshRuns, setSubmitting]);

  return {
    handleApply,
    handleClone,
    handleDelete,
    handleBulkDelete,
    handleNewSearch,
    handleRename,
    handleSubmitted,
  };
};

// ─── Orchestrator ───────────────────────────────────────────────────

/**
 * Orchestration hook for the similarity search panel.
 *
 * Composes useDerivedPanelState (read-only derived state) and
 * useSimilarityPanelActions (command handlers). Components consume
 * the returned API without touching atoms or triggers directly.
 */
export const useSimilarityPanel = (props: SimilaritySearchViewProps) => {
  const { schema } = props;
  const { view } = schema;

  const { page, navigateHome, navigateNewSearch, navigateSimilarityIndex } =
    useNavigate();
  const { cloneConfig, setCloneConfig, clearCloneConfig } = useCloneConfig();

  const {
    clearAndExit,
    selectMode,
    selectedRunIds,
    toggleSelectMode,
    toggleRunSelection,
    selectAll,
    deselectAll,
  } = useMultiSelect();

  // Only the triggers that the frontend actually invokes are declared
  // here. clone/list/getBrainKeys schema entries are handled without
  // round-tripping through the panel event bus.
  const triggers = useTriggers<{
    applyRun: (payload: { run_id: string }, options?: TriggerOptions) => void;
    deleteRun: (payload: { run_id: string }, options?: TriggerOptions) => void;
    bulkDeleteRuns: (
      payload: { run_ids: string[] },
      options?: TriggerOptions
    ) => void;
    renameRun: (
      payload: { run_id: string; new_name: string },
      options?: TriggerOptions
    ) => void;
    getSampleMedia: (
      payload: { sample_ids: string[] },
      options?: TriggerOptions
    ) => void;
  }>({
    applyRun: view.apply_run,
    deleteRun: view.delete_run,
    bulkDeleteRuns: view.bulk_delete_runs,
    renameRun: view.rename_run,
    getSampleMedia: view.get_sample_media,
  });

  const state = useDerivedPanelState(props);

  const actions = useSimilarityPanelActions({
    runs: state.runs,
    refreshRuns: state.refreshRuns,
    removeRun: state.removeRun,
    removeRuns: state.removeRuns,
    setSubmitting: state.setSubmitting,
    navigateHome,
    navigateNewSearch,
    triggers,
    setCloneConfig,
    clearCloneConfig,
    clearAndExit,
  });

  // Re-fetch runs whenever the owner filter changes — it's applied
  // server-side. Skip the initial render so we don't double-fetch
  // alongside the panel's initial load.
  const ownerFilter = state.filterState.ownerFilter;
  const ownerInitRef = useRef(true);
  useEffect(() => {
    if (ownerInitRef.current) {
      ownerInitRef.current = false;
      return;
    }
    state.refreshRuns();
  }, [ownerFilter, state.refreshRuns]);

  // Auto-apply immediate execution runs when they complete.
  // Delegated runs (operator_run_id is set) are excluded — there's no
  // completion event for those, so the user applies them manually.
  const prevRunStatusesRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const prev = prevRunStatusesRef.current;
    const next = new Map(state.runs.map((r) => [r.run_id, r.status]));

    for (const run of state.runs) {
      if (
        run.status === RunStatus.Completed &&
        prev.get(run.run_id) !== RunStatus.Completed
      ) {
        actions.handleApply(run.run_id);
        break;
      }
    }

    prevRunStatusesRef.current = next;
  }, [state.runs, actions]);

  const selection = useMemo(
    () => ({
      selectMode,
      selectedRunIds,
      onToggleSelectMode: toggleSelectMode,
      onToggleRunSelection: toggleRunSelection,
      onSelectAll: selectAll,
      onDeselectAll: deselectAll,
      onClearAndExit: clearAndExit,
    }),
    [
      selectMode,
      selectedRunIds,
      toggleSelectMode,
      toggleRunSelection,
      selectAll,
      deselectAll,
      clearAndExit,
    ]
  );

  return {
    // state
    page,
    loaded: state.loaded,
    runs: state.runs,
    filteredRuns: state.filteredRuns,
    brainKeys: state.brainKeys,
    isPatchesView: state.isPatchesView,
    appliedRunId: state.appliedRunId,
    sampleMedia: state.sampleMedia,
    cloneConfig,
    filterState: state.filterState,
    canFilterByOwner: state.canFilterByOwner,
    isReadOnly: state.isReadOnly,
    selection,

    // actions
    ...actions,
    handleApply: actions.handleApply,
    refreshRuns: state.refreshRuns,
    setFilterState: state.setFilterState,
    navigateHome,
    getSampleMedia: triggers.getSampleMedia,
    navigateSimilarityIndex,
  };
};
