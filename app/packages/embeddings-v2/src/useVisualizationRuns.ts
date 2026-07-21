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
  const [runs, setRuns] = useState<VisualizationRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!datasetName) return undefined;
    let stale = false;
    setRuns(null);
    setError(null);
    fetchRuns(datasetName)
      .then((result) => !stale && setRuns(result))
      .catch((e) => !stale && setError(String(e)));
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
          setRuns((current) =>
            JSON.stringify(current) === JSON.stringify(result)
              ? current
              : result,
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
