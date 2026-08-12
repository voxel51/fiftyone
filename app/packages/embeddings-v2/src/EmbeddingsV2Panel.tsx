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
import PlotView from "./PlotView";
import { fetchRunsStatus, type RunStatus } from "./protocol";
import RunsList from "./RunsList";
import { useVisualizationRuns } from "./useVisualizationRuns";

const DELETE_RUN_OPERATOR = "@voxel51/operators/delete_brain_run";

/** Poll cadence while the list is showing a pending run */
const PENDING_POLL_MS = 5_000;

// Panel instances that have already mounted since this page load.
// Module-scoped on purpose: panel state survives reloads via the
// session, but view-change remounts recreate the component — this set
// distinguishes "first mount after a page load" (reset to the runs
// list) from "remount mid-session" (preserve the open run).
const mountedPanels = new Set<string>();

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

  // The runs are coupled to the dataset the page already loads and
  // should not maintain an independent list.
  const { runs } = useVisualizationRuns();
  const refresh = fos.useRefresh();
  const deleteExecutor = useOperatorExecutor(DELETE_RUN_OPERATOR);
  const [actionError, setActionError] = useState<string | null>(null);

  // A stale key (deleted run, switched dataset, results not yet
  // saved) falls back to the list — a pending run has nothing to plot
  const openRun =
    runs?.find((r) => r.brainKey === openKey && r.ready && !r.error) ?? null;

  // The list always checks the server once when it appears: a run
  // computed from the SDK after the page loaded its dataset is absent
  // from `runs` entirely, so waiting for a pending run to flip would
  // never surface it. Repeat polling is what's conditional — it only
  // earns its cost while a run can still finish — and neither the check
  // nor the interval has any reason to run against the plot (nothing
  // there can change) or a backgrounded tab.
  const knownSignature = runs === null ? null : statusSignature(runs);
  const hasPending = (runs ?? []).some((run) => !run.ready && !run.error);

  useEffect(() => {
    if (openRun || !datasetId || knownSignature === null) return undefined;

    // `active` guards against a straggling response outliving this effect
    // (e.g. the user opens a plot while a request is in flight) — without
    // it, a late mismatch would still fire the heavy refresh against a
    // dataset/view the effect no longer applies to. `inFlight` just skips
    // overlapping ticks if a response is slow
    let active = true;
    let inFlight = false;

    // The hidden-tab gate belongs to the repeat ticks; the one check the
    // list owes itself still runs, so a panel opened in a background tab
    // isn't stuck showing a stale list once it is looked at
    const check = (force = false) => {
      if ((!force && document.hidden) || inFlight) return;
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

    check(true);
    if (!hasPending) {
      return () => {
        active = false;
      };
    }

    const id = window.setInterval(check, PENDING_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
    // openRun is summarized as Boolean(openRun) on purpose: it is a new
    // reference most renders, and depending on it directly would restart
    // the interval far more often than the plot-opened transition needs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(openRun), knownSignature, hasPending, datasetId, refresh]);

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
