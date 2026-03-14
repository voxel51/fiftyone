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
  const { data = {}, schema } = props;
  const { view } = schema;

  const { page, navigateHome, navigateNewSearch } = useNavigate();
  const { runs, loaded, refreshRuns } = useRuns();
  const [submitting, setSubmitting] = useState(false);
  const { cloneConfig, setCloneConfig, clearCloneConfig } = useCloneConfig();

  const { filteredRuns, filterState, setFilterState } = useFilteredRuns(runs);
  const multiSelect = useMultiSelect();

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

  const allBrainKeys = data.brain_keys ?? [];
  const appliedRunId = (props as any).data?.applied_run_id;
  const sampleMedia: Record<string, string> = (data as any).sample_media ?? {};

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
      // Patches view: only brain keys matching the active patches field
      return allBrainKeys.filter((bk) => bk.patches_field === patchesField);
    }
    // Normal view: exclude patch-only brain keys
    return allBrainKeys.filter((bk) => !bk.patches_field);
  }, [allBrainKeys, isPatchesView, patchesField]);

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
      multiSelect.clearAndExit();
    },
    [triggers, multiSelect.clearAndExit]
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
    await refreshRuns();
    setSubmitting(false);
    navigateHome();
  }, [navigateHome, refreshRuns]);

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
    ...multiSelect,

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
  };
};
