import { DeltaSupplier } from "./deltaSupplier";
import { useLighterDeltaSupplier } from "./useLighterDeltaSupplier";
import { useCallback } from "react";
import { useSidebarDeltaSupplier } from "./useSidebarDeltaSupplier";
import { use3dDeltaSupplier } from "./use3dDeltaSupplier";

/**
 * Hook which provides a {@link DeltaSupplier} containing an aggregation of
 * deltas from all annotation sources.
 */
export const useAnnotationDeltaSupplier = (): DeltaSupplier => {
  const supply3dDeltas = use3dDeltaSupplier();
  const supplyLighterDeltas = useLighterDeltaSupplier();
  const supplySidebarDeltas = useSidebarDeltaSupplier();

  return useCallback(() => {
    return [
      ...supply3dDeltas(),
      ...supplyLighterDeltas(),
      ...supplySidebarDeltas(),
    ];
  }, [supply3dDeltas, supplyLighterDeltas, supplySidebarDeltas]);
};
