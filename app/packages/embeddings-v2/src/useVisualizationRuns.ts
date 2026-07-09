import { useCallback, useEffect, useState } from "react";
import { fetchRuns, type VisualizationRun } from "./protocol";

/**
 * The dataset's visualization runs. `runs` is null while loading —
 * the runs page is the landing view, so there is no auto-selection;
 * callers resolve their own active run from the list. `refresh`
 * re-fetches after a mutation (e.g. deleting a run).
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

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { runs, error, refresh };
}
