import { isPatchesView } from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { useSampleInstance } from "../state";
import type { DeltaSupplier } from "./deltaSupplier";
import { use3dDeltaSupplier } from "./use3dDeltaSupplier";

/**
 * Hook which provides a {@link DeltaSupplier} containing an aggregation of
 * deltas from all annotation sources.
 *
 * Sidebar and Lighter (2D) edits are tracked on the shared {@link Sample}
 * instance and emitted via `sample.getJsonPatch()`. 3D edits still flow through
 * their own supplier during the migration to the unified model.
 *
 * For generated (patches) views the patch is emitted as a single-element diff
 * and routed via `sample.firstEditedLabel()` metadata.
 */
export const useAnnotationDeltaSupplier = (): DeltaSupplier => {
  const supply3dDeltas = use3dDeltaSupplier();
  const sample = useSampleInstance();
  const isGenerated = useRecoilValue(isPatchesView);

  return useCallback(() => {
    const result3d = supply3dDeltas();
    const sampleDeltas = sample.getJsonPatch({ isGenerated });

    const deltas = [...result3d.deltas, ...sampleDeltas];

    // Generated views require label metadata so the backend can update the
    // source sample; it comes from the first edited label on the Sample.
    const metadata = isGenerated
      ? sample.firstEditedLabel({ isGenerated: true })
      : undefined;

    return { deltas, metadata };
  }, [isGenerated, sample, supply3dDeltas]);
};
