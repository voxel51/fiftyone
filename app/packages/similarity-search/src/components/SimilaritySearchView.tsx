import { usePanelContext } from "@fiftyone/spaces";
import { Spinner, Text, TextColor } from "@voxel51/voodo";
import React, { Suspense, useCallback } from "react";
import { useAtom } from "jotai";
import { SimilaritySearchViewProps } from "../types";
import { useNavigate } from "../hooks/useNavigate";
import { useRuns } from "../hooks/useRuns";
import { useFilteredRuns } from "../hooks/useFilteredRuns";
import { useMultiSelect } from "../hooks/useMultiSelect";
import useTriggers from "../hooks/useTriggers";
import atoms from "../state";
import RunList from "./RunList";
import NewSearch from "./NewSearch";

function SimilaritySearchReady(props: SimilaritySearchViewProps) {
  const { data = {}, schema } = props;
  const { view } = schema;

  const { page, navigateHome, navigateNewSearch } = useNavigate();
  const { runs, refreshRuns } = useRuns();
  const [cloneConfig, setCloneConfig] = useAtom(atoms.cloneConfig);

  const { filteredRuns, filterState, setFilterState } = useFilteredRuns(runs);
  const {
    selectMode,
    selectedRunIds,
    toggleSelectMode,
    toggleRunSelection,
    selectAll,
    deselectAll,
    clearAndExit,
  } = useMultiSelect();

  // Wire up panel event triggers following the VAL pattern
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

  const brainKeys = data.brain_keys ?? [];
  const appliedRunId = (props as any).data?.applied_run_id;
  const sampleMedia: Record<string, string> = data.sample_media ?? {};

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
      refreshRuns();
    },
    [triggers, clearAndExit, refreshRuns]
  );

  const handleClone = useCallback(
    (runId: string) => {
      // Find the run and pre-fill the clone config
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
    setCloneConfig(null);
    navigateNewSearch();
  }, [setCloneConfig, navigateNewSearch]);

  const handleSubmitted = useCallback(() => {
    navigateHome();
    refreshRuns();
  }, [navigateHome, refreshRuns]);

  return (
    <div className="w-full h-full">
      {page === "home" && (
        <RunList
          runs={runs}
          filteredRuns={filteredRuns}
          appliedRunId={appliedRunId}
          sampleMedia={sampleMedia}
          onApply={handleApply}
          onClone={handleClone}
          onDelete={handleDelete}
          onBulkDelete={handleBulkDelete}
          onRefresh={refreshRuns}
          onNewSearch={handleNewSearch}
          onGetSampleMedia={triggers.getSampleMedia}
          filterState={filterState}
          onFilterChange={setFilterState}
          selectMode={selectMode}
          selectedRunIds={selectedRunIds}
          onToggleSelectMode={toggleSelectMode}
          onToggleRunSelection={toggleRunSelection}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
          onClearAndExit={clearAndExit}
        />
      )}
      {page === "new_search" && (
        <NewSearch
          brainKeys={brainKeys}
          cloneConfig={cloneConfig}
          onBack={navigateHome}
          onSubmitted={handleSubmitted}
        />
      )}
    </div>
  );
}

export default function SimilaritySearchView(props: SimilaritySearchViewProps) {
  const panelContext = usePanelContext();
  const panelId = panelContext?.node?.id;

  if (!panelId) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="w-full h-full flex items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <SimilaritySearchReady {...props} />
    </Suspense>
  );
}
