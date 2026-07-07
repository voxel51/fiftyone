import { useEffect, useState } from "react";
import { fetchRuns, type VisualizationRun } from "./protocol";

/**
 * The dataset's visualization runs, plus the active run resolved from
 * the caller-owned brainKey. The key lives with the caller (panel
 * state) so the choice survives the remounts that view changes cause;
 * this hook defaults it to the first run once the list arrives.
 */
export function useVisualizationRuns(
  datasetName: string | null,
  brainKey: string | null,
  setBrainKey: (brainKey: string) => void,
): {
  runs: VisualizationRun[] | null;
  run: VisualizationRun | null;
  error: string | null;
} {
  const [runs, setRuns] = useState<VisualizationRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  }, [datasetName]);

  // Default to the first run once the list arrives
  useEffect(() => {
    if (!runs?.length) return;
    if (!brainKey || !runs.some((r) => r.brainKey === brainKey)) {
      setBrainKey(runs[0].brainKey);
    }
  }, [runs, brainKey, setBrainKey]);

  const run = runs?.find((r) => r.brainKey === brainKey) ?? null;
  return { runs, run, error };
}
