/**
 * Panel controller: the runs list is the landing view; opening a run
 * shows the plot. The open run (`brainResult`) and the color-by field
 * (`colorByField`) live in SHARED panel state, which rides the session:
 * a page reload, a saved workspace, or an SDK-built
 * `fo.Panel(type="Embeddings", state=...)` reopens the same run with the
 * same coloring. Those key names are the documented public contract
 * (see the Embeddings panel section of docs/source/user_guide/app.rst).
 * A newly added panel has a fresh id and empty state, so it lands on the
 * runs list; a key that names no ready run on this dataset falls back to
 * the list too. Opening a run from the list resets color-by, so one
 * run's field never carries over to another. Run deletion executes the
 * builtin delete_brain_run operator, which enforces permissions where
 * the deployment defines them; the panel renders its own confirmation,
 * so the operator's prompt is bypassed.
 */
import { useOperatorExecutor, usePendingRuns } from "@fiftyone/operators";
import { usePanelStatePartial } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { useEffect, useRef, useState } from "react";
import { useExtensionGeneration } from "./extensions";
import PlotView from "./PlotView";
import { fetchRunsStatus, type RunStatus } from "./protocol";
import RunsList from "./RunsList";
import { useClearSelectionOnClose } from "./useClearSelectionOnClose";
import { useVisualizationRuns } from "./useVisualizationRuns";

const DELETE_RUN_OPERATOR = "@voxel51/operators/delete_brain_run";
const PENDING_RUNS = {
  operators: [
    "@voxel51/brain/compute_visualization",
    "@voxel51/operators/compute_visualization",
  ],
};

/** Poll cadence while the runs list is showing */
const RUNS_POLL_MS = 5_000;

/** `key:ready:error` per run, order-independent: the basis for deciding
 * whether the dataset the page loaded still matches the server's runs */
function statusSignature(runs: RunStatus[]): string {
  return runs
    .map((run) => `${run.brainKey}:${run.ready ? 1 : 0}:${run.error ? 1 : 0}`)
    .sort()
    .join(",");
}

export default function EmbeddingsV2Panel() {
  const datasetName = fos.useCurrentDatasetName() ?? null;
  const datasetId = fos.useCurrentDatasetId() ?? null;
  // The plot selects the extension's hooks at mount; a late-arriving
  // registration (the edition entrypoint is dynamically imported) must
  // remount it rather than swap hooks under it
  const extensionGeneration = useExtensionGeneration();
  // Closing the tab clears the plot's selection: the grid would otherwise
  // stay narrowed by a lasso with nothing left in the UI to clear it
  useClearSelectionOnClose();
  // Shared, not local: workspaces and the session persist only shared
  // panel state (see the header for the key names)
  const [openKeyState, setOpenKey] = usePanelStatePartial<string | null>(
    "brainResult",
    null,
  );
  const [, setColorField] = usePanelStatePartial<string | null>(
    "colorByField",
    null,
  );

  // Switching datasets mid-session must not carry the open run along:
  // brain keys are not unique across datasets, so a stale key could
  // silently open a same-named run on the new dataset. The render-time
  // check covers the frame before the effect persists the reset
  const prevDataset = useRef(datasetName);
  const datasetSwitched = prevDataset.current !== datasetName;

  // SDK-written state arrives unchecked: anything but a string is no
  // selection. Partials are also undefined until first set
  const openKey =
    !datasetSwitched && typeof openKeyState === "string" ? openKeyState : null;

  useEffect(() => {
    if (prevDataset.current !== datasetName) {
      prevDataset.current = datasetName;
      setOpenKey(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetName]);

  // The runs are coupled to the dataset the page already loads and
  // should not maintain an independent list.
  const { runs } = useVisualizationRuns();
  const knownSignature = runs === null ? null : statusSignature(runs);
  const { runs: pendingRuns, loaded: pendingLoaded } = usePendingRuns(
    PENDING_RUNS,
    runs,
  );
  const refresh = fos.useRefresh();
  const deleteExecutor = useOperatorExecutor(DELETE_RUN_OPERATOR);
  const [actionError, setActionError] = useState<string | null>(null);

  // A stale key (deleted run, switched dataset, results not yet
  // saved) falls back to the list — a pending run has nothing to plot
  const openRun =
    runs?.find((r) => r.brainKey === openKey && r.ready && !r.error) ?? null;

  // The runs the page loaded can be stale whenever the server's runs
  // change: a new run (from the create action, the SDK, or another user)
  // is absent from `runs` until it registers, and a set-backed run
  // registers only once its results are written, so it never shows as
  // pending first. The panel checks once when it opens, on either view,
  // and the list then polls for as long as it is showing.
  const latestSignature = useRef(knownSignature);
  useEffect(() => {
    latestSignature.current = knownSignature;
  }, [knownSignature]);

  // Keyed by dataset, so a dataset switch checks again. The response is
  // compared with the runs loaded when it lands, not when it was sent: a
  // reload in between already brought the page up to date
  const openCheckedDataset = useRef<string | null>(null);
  useEffect(() => {
    if (!datasetId || knownSignature === null) return;
    if (openCheckedDataset.current === datasetId) return;
    openCheckedDataset.current = datasetId;

    fetchRunsStatus(datasetId)
      .then((statuses) => {
        if (openCheckedDataset.current !== datasetId) return;
        if (statusSignature(statuses) !== latestSignature.current) refresh();
      })
      .catch(() => undefined);
  }, [datasetId, knownSignature, refresh]);

  useEffect(() => {
    if (openRun || !datasetId || knownSignature === null) return undefined;

    // `active` guards against a straggling response outliving this effect
    // (e.g. the user opens a plot while a request is in flight) — without
    // it, a late mismatch would still fire the heavy refresh against a
    // dataset/view the effect no longer applies to. `inFlight` just skips
    // overlapping ticks if a response is slow
    let active = true;
    let inFlight = false;

    const check = () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      fetchRunsStatus(datasetId)
        .then((statuses) => {
          if (!active) return;
          if (statusSignature(statuses) !== knownSignature) refresh();
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight = false;
        });
    };

    const id = window.setInterval(check, RUNS_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
    // openRun is summarized as Boolean(openRun) on purpose: it is a new
    // reference most renders, and depending on it directly would restart
    // the interval far more often than the plot-opened transition needs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(openRun), knownSignature, datasetId, refresh]);

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

  if (openRun) {
    return (
      <PlotView
        key={extensionGeneration}
        datasetName={datasetName}
        run={openRun}
        onBack={() => setOpenKey(null)}
      />
    );
  }
  return (
    <RunsList
      runs={pendingLoaded ? runs : null}
      pendingRuns={pendingRuns}
      actionError={actionError}
      onOpen={handleOpen}
      onDelete={handleDelete}
    />
  );
}
