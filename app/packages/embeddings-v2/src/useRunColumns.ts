import { useEffect, useRef, useState } from "react";
import {
  fetchGeometry,
  fetchIds,
  fetchRunInfo,
  idAt,
  type IdColumn,
} from "./protocol";
import type { GeometryLoader } from "./extensions";
import type { EmbeddingPoint } from "./renderer";

/** Wire-order slice size for progressive loading */
export const CHUNK = 100_000;

/** A run's columns as loaded so far; republished after every chunk */
export interface Loaded {
  brainKey: string;
  points: EmbeddingPoint[];
  ids: IdColumn;
  total: number;
}

/**
 * Geometry + ids for the selected run, loaded progressively in
 * wire-order chunks: the plot paints as each slice lands. The
 * in-flight guard is a ref, NOT state: keying the effect on `loaded`
 * would make each chunk's setLoaded cancel its own loop.
 */
export function useRunColumns(
  datasetName: string | null,
  brainKey: string | null,
  /** Streams the run's geometry client-side (an extension owns the run's
   * storage). When set, the server column path below is never entered. */
  loadGeometry: GeometryLoader | null = null,
  /** Whether an extension owns this run: gates the wait for its loader, so a
   * run whose loader is still resolving does not fall through to the server */
  ownsGeometry: boolean = false,
): { loaded: Loaded | null; error: string | null } {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadingKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!datasetName || !brainKey) return undefined;
    if (ownsGeometry && !loadGeometry) return undefined;
    const loadKey = `${datasetName}::${brainKey}`;
    if (loadingKeyRef.current === loadKey) return undefined;
    loadingKeyRef.current = loadKey;
    let stale = false;
    // The previous run's points must not linger while the new one
    // loads (and a failed load must not strand them either)
    setLoaded(null);
    setError(null);
    (async () => {
      if (loadGeometry) {
        const { points, ids, total } = await loadGeometry(
          (partial, buffer, n) => {
            if (stale) return;
            setLoaded({ brainKey, points: partial, ids: buffer, total: n });
          },
        );
        if (stale) return;
        setLoaded({ brainKey, points, ids, total });
        return;
      }

      // run-info first: reports n AND warms the server's results cache,
      // so the parallel column fetches below don't race a cold load
      const info = await fetchRunInfo(datasetName, brainKey);
      if (stale) return;

      const total = info.n;
      const ids: IdColumn = new Uint8Array(total * 12);
      const points: EmbeddingPoint[] = [];

      // A zero-point run has no chunks: publish the empty columns or
      // the loading spinner never resolves
      if (total === 0) {
        setLoaded({ brainKey, points: [], ids, total });
        return;
      }

      for (let offset = 0; offset < total; offset += CHUNK) {
        const slice = { offset, limit: Math.min(CHUNK, total - offset) };
        const [geometry, sliceIds] = await Promise.all([
          fetchGeometry(datasetName, brainKey, slice),
          fetchIds(datasetName, brainKey, slice),
        ]);
        if (stale) return;

        ids.set(sliceIds, offset * 12);
        // Runs may carry a third coordinate; it rides along on the
        // point and the renderer decides whether it has a camera for it
        const [xs, ys, zs] = geometry.columns;
        for (let i = 0; i < geometry.n; i++) {
          points.push({
            id: idAt(ids, offset + i),
            x: xs[i],
            y: ys[i],
            ...(zs ? { z: zs[i] } : null),
            label: null,
          });
        }
        setLoaded({ brainKey, points: points.slice(), ids, total });
      }
    })().catch((e) => {
      if (stale) return;
      loadingKeyRef.current = null;
      setError(String(e));
    });
    return () => {
      stale = true;
      // An aborted load (run switch mid-flight) may retry later
      if (loadingKeyRef.current === loadKey) {
        loadingKeyRef.current = null;
      }
    };
  }, [datasetName, brainKey, loadGeometry, ownsGeometry]);

  return { loaded, error };
}
