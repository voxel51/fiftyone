import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import type { VisualizationRun } from "./protocol";

/** The brain config class every visualization run derives from */
const VISUALIZATION_CLS = "fiftyone.brain.visualization.";

/**
 * The dataset's visualization runs.
 *
 * Read from the dataset the page already loaded — its GraphQL query carries
 * `brainMethods` on every dataset query, so asking a route for the same
 * records was a round trip for data already in hand. `runs` is null only
 * before the dataset resolves; the runs page is the landing view, so there is
 * no auto-selection and callers pick their own active run from the list.
 *
 * A run that is still computing arrives with `ready: false` and flips when
 * the dataset query refreshes — no polling, because the list is no longer
 * something this panel owns.
 */
export function useVisualizationRuns(): {
  runs: VisualizationRun[] | null;
} {
  const dataset = useRecoilValue(fos.dataset);

  const runs = useMemo(() => {
    if (!dataset) return null;

    return (dataset.brainMethods ?? [])
      .filter((run) => run.config?.cls?.startsWith(VISUALIZATION_CLS))
      .map((run) => ({
        brainKey: run.key,
        method: run.config?.method ?? null,
        dims: run.config?.numDims ?? null,
        patchesField: run.config?.patchesField ?? null,
        pointsField: run.config?.pointsField ?? null,
        model: run.config?.model ?? null,
        ready: run.ready ?? false,
        // The run timestamp keys every per-run client cache, so it has to be
        // the same string the columns were cached under
        timestamp: run.timestamp ? String(run.timestamp) : null,
      }));
  }, [dataset]);

  return { runs };
}
