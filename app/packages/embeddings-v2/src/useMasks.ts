import { useEffect, useMemo, useState } from "react";
import { fetchMasks, type Masks } from "./protocol";

/**
 * The run's view/filter masks, shaped for the renderer: view stages
 * and sidebar filters both scope the plot, so their masks combine into
 * one `visibleMask` that hides non-members. Masks cover the run's full
 * wire order; during a progressive load the loaded prefix is valid by
 * construction, so `visibleMask` is sliced to `loadedCount`.
 */
export function useMasks(
  datasetName: string | null,
  brainKey: string | null,
  view: unknown[],
  filters: unknown,
  loadedCount: number,
): {
  visibleMask: Uint8Array | null;
  visibleCount: number | null;
  error: string | null;
} {
  const [masks, setMasks] = useState<Masks | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetName || !brainKey) {
      setMasks(null);
      return undefined;
    }
    let stale = false;
    fetchMasks(datasetName, brainKey, view, filters)
      .then((result) => !stale && setMasks(result))
      .catch((e) => !stale && setError(String(e)));
    return () => {
      stale = true;
    };
  }, [datasetName, brainKey, view, filters]);

  // The endpoint early-outs each mask to null when its inputs are empty
  // (no view stages / no filters), so combining only pays when both exist
  const combined = useMemo(() => {
    const visible = masks?.visible ?? null;
    const match = masks?.match ?? null;
    if (!visible || !match) return visible ?? match;
    const out = new Uint8Array(visible.length);
    for (let i = 0; i < out.length; i++) {
      out[i] = visible[i] && match[i] ? 1 : 0;
    }
    return out;
  }, [masks]);

  const visibleMask = useMemo(() => {
    if (!combined || !loadedCount) return null;
    return combined.length === loadedCount
      ? combined
      : combined.subarray(0, loadedCount);
  }, [combined, loadedCount]);

  const visibleCount = useMemo(() => {
    if (!combined) return null;
    let count = 0;
    for (let i = 0; i < combined.length; i++) {
      count += combined[i];
    }
    return count;
  }, [combined]);

  return { visibleMask, visibleCount, error };
}
