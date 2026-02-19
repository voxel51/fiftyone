import { usePanelContext } from "@fiftyone/spaces";
import { Spinner, Text, TextColor } from "@voxel51/voodo";
import React, { Suspense, useCallback } from "react";
import { useAtom } from "jotai";
import { SimilaritySearchViewProps } from "../types";
import { useNavigate } from "../hooks/useNavigate";
import { useRuns } from "../hooks/useRuns";
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

  // Wire up panel event triggers following the VAL pattern
  const triggers = useTriggers<{
    applyRun: (payload: { run_id: string }) => void;
    deleteRun: (payload: { run_id: string }) => void;
    cloneRun: (payload: { run_id: string }) => void;
    renameRun: (payload: { run_id: string; new_name: string }) => void;
    listRuns: () => void;
    getBrainKeys: () => void;
  }>({
    applyRun: view.apply_run,
    deleteRun: view.delete_run,
    cloneRun: view.clone_run,
    renameRun: view.rename_run,
    listRuns: view.list_runs,
    getBrainKeys: view.get_brain_keys,
  });

  const brainKeys = data.brain_keys ?? [];
  const appliedRunId = (props as any).data?.applied_run_id;

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
    // Refresh after a short delay to pick up the new run
    setTimeout(() => refreshRuns(), 500);
  }, [navigateHome, refreshRuns]);

  return (
    <div className="w-full h-full">
      {page === "home" && (
        <RunList
          runs={runs}
          appliedRunId={appliedRunId}
          onApply={handleApply}
          onClone={handleClone}
          onDelete={handleDelete}
          onRefresh={refreshRuns}
          onNewSearch={handleNewSearch}
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
