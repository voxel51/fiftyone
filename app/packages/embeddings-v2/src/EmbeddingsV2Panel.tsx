/**
 * Panel controller: the runs list is the landing view; opening a run
 * shows the plot. `openKey` lives in panel state (local) so the
 * selection survives the remounts that view changes cause, per panel
 * instance. Run deletion executes the builtin delete_brain_run
 * operator, which enforces permissions where the deployment defines
 * them; the panel renders its own confirmation, so the operator's
 * prompt is bypassed.
 */
import { useOperatorExecutor } from "@fiftyone/operators";
import { usePanelStatePartial } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { useState } from "react";
import { useRecoilValue } from "recoil";
import PlotView from "./PlotView";
import RunsList from "./RunsList";
import { useVisualizationRuns } from "./useVisualizationRuns";

const DELETE_RUN_OPERATOR = "@voxel51/operators/delete_brain_run";

export default function EmbeddingsV2Panel() {
  const datasetName = useRecoilValue(fos.datasetName) ?? null;
  const [openKeyState, setOpenKey] = usePanelStatePartial<string | null>(
    "openKey",
    null,
    true,
  );
  const openKey = openKeyState ?? null;

  const { runs, error, refresh } = useVisualizationRuns(datasetName);
  const deleteExecutor = useOperatorExecutor(DELETE_RUN_OPERATOR);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleDelete = (brainKey: string) => {
    setActionError(null);
    deleteExecutor.execute(
      { brain_key: brainKey },
      {
        callback: (result: { error?: unknown } | null) => {
          if (result?.error) {
            setActionError(String(result.error));
          }
          refresh();
        },
      },
    );
  };

  // A stale key (deleted run, switched dataset) falls back to the list
  const openRun = runs?.find((r) => r.brainKey === openKey) ?? null;

  if (openRun) {
    return (
      <PlotView
        datasetName={datasetName}
        run={openRun}
        onBack={() => setOpenKey(null)}
      />
    );
  }
  return (
    <RunsList
      runs={runs}
      error={error}
      actionError={actionError}
      onOpen={setOpenKey}
      onDelete={handleDelete}
    />
  );
}
