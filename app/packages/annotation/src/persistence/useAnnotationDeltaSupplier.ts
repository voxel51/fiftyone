import type { DeltaSupplier } from "./deltaSupplier";
import { useLighterDeltaSupplier } from "./useLighterDeltaSupplier";
import { useCallback } from "react";
import { useSidebarDeltaSupplier } from "./useSidebarDeltaSupplier";
import { use3dDeltaSupplier } from "./use3dDeltaSupplier";

/**
 * Hook which aggregates captured annotation deltas from all sources.
 */
export const useAnnotationDeltaSupplier = (): DeltaSupplier => {
  const supply3dDeltas = use3dDeltaSupplier();
  const supplyLighterDeltas = useLighterDeltaSupplier();
  const supplySidebarDeltas = useSidebarDeltaSupplier();

  return useCallback(
    () => ({
      deltas: [
        ...supply3dDeltas().deltas,
        ...supplyLighterDeltas().deltas,
        ...supplySidebarDeltas().deltas,
      ],
    }),
    [supply3dDeltas, supplyLighterDeltas, supplySidebarDeltas]
  );
};
