import { useEffect, useMemo, useState } from "react";
import { fetchMasks } from "./protocol";

/**
 * The wire indices of an images run's points whose samples own the given
 * patches.
 *
 * A patches view lists patches, so its selections (grid checkboxes, other
 * panels' ids) are patch ids — which never name a sample-keyed run's
 * points. Only the server can map a patch to its sample, and the masks
 * route already does: an id stage over the patches, evaluated in the
 * grid's view, comes back as a match mask over the run's own points.
 *
 * Null while nothing is asked, while the answer is pending, when it fails,
 * and when no loaded point matches — "no selection", never an empty one,
 * which would dim every point. The mask spans the run; matches clip to the
 * loaded prefix.
 */
export function useSelectedPatchOwners(
  datasetName: string | null,
  brainKey: string | null,
  view: unknown[],
  patchIds: readonly string[] | null,
  loadedCount: number,
): number[] | null {
  const [answer, setAnswer] = useState<{
    patchIds: readonly string[];
    match: Uint8Array | null;
  } | null>(null);

  useEffect(() => {
    if (!datasetName || !brainKey || !patchIds?.length) return undefined;
    let stale = false;
    fetchMasks(datasetName, brainKey, view, null, {
      "fiftyone.core.stages.Select": {
        sample_ids: Array.from(patchIds),
        ordered: false,
      },
    })
      .then(({ match }) => !stale && setAnswer({ patchIds, match }))
      // Nothing lights up; the next selection asks again
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, [datasetName, brainKey, view, patchIds]);

  return useMemo(() => {
    // An answer for an earlier selection must not light this one
    if (!answer?.match || answer.patchIds !== patchIds) return null;
    const { match } = answer;
    const indices: number[] = [];
    const n = Math.min(loadedCount, match.length);
    for (let i = 0; i < n; i++) if (match[i]) indices.push(i);
    return indices.length ? indices : null;
  }, [answer, patchIds, loadedCount]);
}
