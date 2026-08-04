/**
 * Panel controller: the runs list is the landing view; opening a run
 * shows the plot. `openKey` lives in panel state (local) so the
 * selection survives the remounts that view changes cause, per panel
 * instance — but it is deliberately NOT restored across page loads or
 * dataset switches: the panel always lands on the runs list, and
 * color-by resets when a run is opened, so no run ever renders with
 * view state it can't vouch for (a restored field choice can be
 * invalid for the run, and a restored key can collide across
 * datasets). Run deletion executes the builtin delete_brain_run
 * operator, which enforces permissions where the deployment defines
 * them; the panel renders its own confirmation, so the operator's
 * prompt is bypassed.
 */
import { useOperatorExecutor } from "@fiftyone/operators";
import { usePanelId, usePanelStatePartial } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { useEffect, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import PlotView from "./PlotView";
import RunsList from "./RunsList";
import { useVisualizationRuns } from "./useVisualizationRuns";

const DELETE_RUN_OPERATOR = "@voxel51/operators/delete_brain_run";

// Panel instances that have already mounted since this page load.
// Module-scoped on purpose: panel state survives reloads via the
// session, but view-change remounts recreate the component — this set
// distinguishes "first mount after a page load" (reset to the runs
// list) from "remount mid-session" (preserve the open run).
const mountedPanels = new Set<string>();

export default function EmbeddingsV2Panel() {
  const datasetName = useRecoilValue(fos.datasetName) ?? null;
  const panelId = usePanelId();
  const [openKeyState, setOpenKey] = usePanelStatePartial<string | null>(
    "openKey",
    null,
    true,
  );
  const [, setColorField] = usePanelStatePartial<string | null>(
    "colorField",
    null,
    true,
  );

  // Switching datasets mid-session must not carry the open run along:
  // brain keys are not unique across datasets, so a stale key could
  // silently open a same-named run on the new dataset. The render-time
  // check covers the frame before the effect persists the reset
  const prevDataset = useRef(datasetName);
  const datasetSwitched = prevDataset.current !== datasetName;

  const isFirstMountThisPageLoad = !mountedPanels.has(panelId);
  const openKey =
    isFirstMountThisPageLoad || datasetSwitched ? null : (openKeyState ?? null);

  useEffect(() => {
    if (!mountedPanels.has(panelId)) {
      mountedPanels.add(panelId);
      setOpenKey(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId]);

  useEffect(() => {
    if (prevDataset.current !== datasetName) {
      prevDataset.current = datasetName;
      setOpenKey(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetName]);

  // The runs are coupled to the dataset the page already loadss and
  // should not maintain an independent list.
  const { runs } = useVisualizationRuns();
  const refresh = fos.useRefresh();
  const deleteExecutor = useOperatorExecutor(DELETE_RUN_OPERATOR);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleOpen = (brainKey: string) => {
    // every run opens uncolored: a carried-over choice can be invalid
    // for the run (patches fields) or mismatch its geometry
    setColorField(null);
    setOpenKey(brainKey);
  };

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

  // A stale key (deleted run, switched dataset, results not yet
  // saved) falls back to the list — a pending run has nothing to plot
  const openRun = runs?.find((r) => r.brainKey === openKey && r.ready) ?? null;

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
      actionError={actionError}
      onOpen={handleOpen}
      onDelete={handleDelete}
    />
  );
}
