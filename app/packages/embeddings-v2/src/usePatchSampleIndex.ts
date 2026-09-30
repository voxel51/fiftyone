import { useEffect, useRef, useState } from "react";
import { buildIdIndex, fetchIds } from "./protocol";

/**
 * Sample id -> the wire indices of that sample's points, for a patches run.
 *
 * A patches run's points are labels, so a sample-level selection (grid
 * checkboxes in a samples view, another panel's selection) cannot be looked
 * up in the plot's own id space: selecting one image has to light every
 * patch it owns. The ids column's `samples` kind names each point's owning
 * sample.
 *
 * Fetched lazily and once per run: the column is 12 bytes per point, so a
 * large run pays for it only once something is actually selected, and
 * clearing then re-making a selection never refetches. The index spans the
 * whole run; callers clip its matches to the points loaded so far.
 *
 * A failed fetch retries when `selection` changes identity — the caller
 * passes whatever identifies the live selection — so a transient error
 * cannot leave the run silently unhighlightable for as long as something
 * stays selected.
 */
export function usePatchSampleIndex(
  datasetName: string | null,
  brainKey: string | null,
  patchesField: string | null,
  enabled: boolean,
  selection: unknown,
): Map<string, number[]> | null {
  const runKey =
    datasetName && brainKey && patchesField
      ? `${datasetName}\0${brainKey}\0${patchesField}`
      : null;
  const [index, setIndex] = useState<{
    runKey: string;
    map: Map<string, number[]>;
  } | null>(null);
  // The run a request is in flight for. Only a run switch orphans a
  // response, never `enabled` going false: a selection cleared mid-fetch
  // must still keep the result, or the run stays marked as fetching with no
  // index and never asks again
  const inFlight = useRef<string | null>(null);
  const indexedRun = index?.runKey ?? null;
  // The run and selection a fetch failed for
  const [failed, setFailed] = useState<{
    runKey: string;
    selection: unknown;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !runKey || !datasetName || !brainKey) return;
    if (indexedRun === runKey || inFlight.current === runKey) return;
    // After a failure, wait for the selection to change: recording the
    // failure re-runs this effect, so asking again right away would loop
    // for as long as the server keeps failing
    if (failed?.runKey === runKey && failed.selection === selection) return;
    inFlight.current = runKey;
    fetchIds(datasetName, brainKey, undefined, "samples")
      .then((ids) => {
        if (inFlight.current === runKey) {
          setIndex({ runKey, map: buildIdIndex(ids) });
          setFailed(null);
        }
      })
      // The plot styles nothing meanwhile; the next selection asks again
      .catch(() => {
        if (inFlight.current === runKey) setFailed({ runKey, selection });
      })
      .finally(() => {
        if (inFlight.current === runKey) inFlight.current = null;
      });
  }, [enabled, runKey, indexedRun, failed, selection, datasetName, brainKey]);

  return index?.runKey === runKey ? index.map : null;
}
