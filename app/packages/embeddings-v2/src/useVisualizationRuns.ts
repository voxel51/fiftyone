import { useCallback, useEffect, useState } from "react";
import { fetchRuns, type VisualizationRun } from "./protocol";

/** Poll cadence while any run is awaiting results */
export const PENDING_POLL_MS = 5_000;

/**
 * The dataset's visualization runs. `runs` is null while loading —
 * the runs page is the landing view, so there is no auto-selection;
 * callers resolve their own active run from the list. `refresh`
 * re-fetches after a mutation (e.g. deleting a run).
 *
 * While any run is pending (no results yet), the list re-fetches every
 * few seconds so a finished computation appears without a reload. The
 * poll stops the moment every run is ready, skips ticks while the tab
 * is hidden, keeps the last list on transient errors, and only
 * publishes a new list when something actually changed.
 */
export function useVisualizationRuns(datasetName: string | null): {
  runs: VisualizationRun[] | null;
  error: string | null;
  refresh: () => void;
} {
  // runs/error are tagged with the dataset they were fetched for so a
  // dataset switch never serves the previous dataset's state, even for
  // the one render before the fetch effect runs
  const [state, setState] = useState<{
    dataset: string | null;
    runs: VisualizationRun[] | null;
    error: string | null;
  }>({ dataset: null, runs: null, error: null });
  const [nonce, setNonce] = useState(0);

  const current = state.dataset === datasetName ? state : null;
  const runs = current?.runs ?? null;
  const error = current?.error ?? null;

  useEffect(() => {
    if (!datasetName) return undefined;
    let stale = false;
    setState({ dataset: datasetName, runs: null, error: null });
    fetchRuns(datasetName)
      .then(
        (result) =>
          !stale &&
          setState({ dataset: datasetName, runs: result, error: null }),
      )
      .catch(
        (e) =>
          !stale &&
          setState({ dataset: datasetName, runs: null, error: String(e) }),
      );
    return () => {
      stale = true;
    };
  }, [datasetName, nonce]);

  const pending = Boolean(runs?.some((run) => !run.ready));
  useEffect(() => {
    if (!datasetName || !pending) return undefined;
    let stale = false;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      fetchRuns(datasetName)
        .then((result) => {
          if (stale) return;
          setState((prev) =>
            prev.dataset === datasetName &&
            JSON.stringify(prev.runs) === JSON.stringify(result)
              ? prev
              : { dataset: datasetName, runs: result, error: null },
          );
        })
        .catch(() => undefined);
    }, PENDING_POLL_MS);
    return () => {
      stale = true;
      window.clearInterval(id);
    };
  }, [datasetName, pending]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { runs, error, refresh };
}
