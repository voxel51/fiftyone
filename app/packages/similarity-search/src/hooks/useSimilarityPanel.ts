import { useCallback, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { SimilaritySearchViewProps } from "../types";
import { useNavigate } from "./useNavigate";
import { useRuns } from "./useRuns";
import { useFilteredRuns } from "./useFilteredRuns";
import { useMultiSelect } from "./useMultiSelect";
import { useCloneConfig } from "./useCloneConfig";
import useTriggers from "./useTriggers";

/**
 * Orchestration hook for the similarity search panel.
 *
 * Wires together navigation, runs, filtering, multi-select,
 * clone config, and panel event triggers. Components consume
 * the returned API without touching atoms or triggers directly.
 */
export const useSimilarityPanel = (props: SimilaritySearchViewProps) => {
  const { data: panelData = {}, schema } = props;
  const { view } = schema;

  const { page, navigateHome, navigateNewSearch, navigateSimilarityIndex } =
    useNavigate();
  const { runs: allRuns, loaded, refreshRuns } = useRuns();
  const [submitting, setSubmitting] = useState(false);
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

  const triggers = useTriggers<{
    applyRun: (payload: { run_id: string }) => void;
    deleteRun: (payload: { run_id: string }) => void;
    bulkDeleteRuns: (payload: { run_ids: string[] }) => void;
    cloneRun: (payload: { run_id: string }) => void;
    renameRun: (payload: { run_id: string; new_name: string }) => void;
    listRuns: () => void;
    getBrainKeys: () => void;
    getSampleMedia: (payload: { sample_ids: string[] }) => void;
  }>({
    applyRun: view.apply_run,
    deleteRun: view.delete_run,
    bulkDeleteRuns: view.bulk_delete_runs,
    cloneRun: view.clone_run,
    renameRun: view.rename_run,
    listRuns: view.list_runs,
    getBrainKeys: view.get_brain_keys,
    getSampleMedia: view.get_sample_media,
  });

  const allBrainKeys = panelData.brain_keys ?? [];
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
  const canFilterByOwner = !!currentUser;
  const { filteredRuns, filterState, setFilterState } = useFilteredRuns(
    runs,
    currentUser
  );

  const handleApply = useCallback(
    (runId: string) => {
      triggers.applyRun({ run_id: runId });
    },
    [triggers]
  );

  const handleDelete = useCallback(
    (runId: string) => {
      triggers.deleteRun({ run_id: runId });
    },
    [triggers]
  );

  const handleBulkDelete = useCallback(
    (runIds: string[]) => {
      triggers.bulkDeleteRuns({ run_ids: runIds });
      clearAndExit();
    },
    [triggers, clearAndExit]
  );

  const handleClone = useCallback(
    (runId: string) => {
      const run = runs.find((r) => r.run_id === runId);
      if (run) {
        setCloneConfig({
          brain_key: run.brain_key,
          query_type: run.query_type,
          query: typeof run.query === "string" ? run.query : undefined,
          k: run.k,
          reverse: run.reverse,
          dist_field: run.dist_field,
        });
        navigateNewSearch();
      }
    },
    [runs, setCloneConfig, navigateNewSearch]
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
  }, [navigateHome, refreshRuns]);

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
    loaded: loaded && !submitting,
    runs,
    filteredRuns,
    brainKeys,
    isPatchesView,
    appliedRunId,
    sampleMedia,
    cloneConfig,
    filterState,
    canFilterByOwner,
    selection,

    // actions
    handleApply,
    handleClone,
    handleDelete,
    handleBulkDelete,
    handleNewSearch,
    handleSubmitted,
    refreshRuns,
    setFilterState,
    navigateHome,
    getSampleMedia: triggers.getSampleMedia,
    navigateSimilarityIndex,
  };
};
