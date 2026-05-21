import type { DeltaSupplier } from "./deltaSupplier";
import { useLighterDeltaSupplier } from "./useLighterDeltaSupplier";
import { useCallback } from "react";
import { use3dDeltaSupplier } from "./use3dDeltaSupplier";
import { useSampleInstance } from "../state";

/**
 * Hook which provides a {@link DeltaSupplier} containing an aggregation of
 * deltas from all annotation sources.
 *
 * Sidebar edits are tracked on the shared {@link Sample} instance and emitted
 * via `sample.getJsonPatch()`. Lighter and 3D edits still flow through their
 * own per-source suppliers during the migration to the unified model.
 */
export const useAnnotationDeltaSupplier = (): DeltaSupplier => {
  const supply3dDeltas = use3dDeltaSupplier();
  const supplyLighterDeltas = useLighterDeltaSupplier();
  const sample = useSampleInstance();

  return useCallback(() => {
    const result3d = supply3dDeltas();
    const resultLighter = supplyLighterDeltas();
    const sampleDeltas = sample.getJsonPatch();

    const deltas = [
      ...result3d.deltas,
      ...resultLighter.deltas,
      ...sampleDeltas,
    ];

    // Metadata for generated views only comes from Lighter
    return { deltas, metadata: resultLighter.metadata };
  }, [sample, supply3dDeltas, supplyLighterDeltas]);
};
