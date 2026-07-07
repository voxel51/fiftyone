import { useEffect, useMemo, useState } from "react";
import { fetchMasks, type Masks } from "./protocol";

/**
 * The run's view/filter masks, shaped for the renderer: view stages
 * hide points (`visibleMask`), sidebar filters dim them
 * (`matchIndices`, via the renderer's selection mechanism). Masks
 * cover the run's full wire order; during a progressive load the
 * loaded prefix is valid by construction, so `visibleMask` is sliced
 * to `loadedCount`.
 */
export function useMasks(
  datasetName: string | null,
  brainKey: string | null,
  view: unknown[],
  filters: unknown,
  loadedCount: number,
): {
  visibleMask: Uint8Array | null;
  matchIndices: number[] | null;
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

  const visibleMask = useMemo(() => {
    if (!masks?.visible || !loadedCount) return null;
    return masks.visible.length === loadedCount
      ? masks.visible
      : masks.visible.subarray(0, loadedCount);
  }, [masks, loadedCount]);

  // Filter matches dim via the renderer's selection mechanism; an actual
  // grid selection takes precedence over filter dimming (caller's call)
  const matchIndices = useMemo(() => {
    if (!masks?.match) return null;
    const indices: number[] = [];
    for (let i = 0; i < masks.match.length; i++) {
      if (masks.match[i]) indices.push(i);
    }
    return indices;
  }, [masks]);

  const visibleCount = useMemo(() => {
    if (!masks?.visible) return null;
    let count = 0;
    for (let i = 0; i < masks.visible.length; i++) {
      count += masks.visible[i];
    }
    return count;
  }, [masks]);

  return { visibleMask, matchIndices, visibleCount, error };
}
