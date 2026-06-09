import { useCallback } from "react";
import type { DeltaSupplier } from "./deltaSupplier";
import { useRegisteredDeltaSuppliers } from "./deltaSupplierRegistry";
import { useLighterDeltaSupplier } from "./useLighterDeltaSupplier";
import { useSidebarDeltaSupplier } from "./useSidebarDeltaSupplier";
import { use3dDeltaSupplier } from "./use3dDeltaSupplier";
import { useTemporalDetectionDeltaSupplier } from "./useTemporalDetectionDeltaSupplier";

/**
 * Hook which provides a {@link DeltaSupplier} containing an aggregation of
 * deltas from all annotation sources, including those contributed by feature
 * surfaces via {@link useRegisterDeltaSupplier} (e.g. video annotation).
 */
export const useAnnotationDeltaSupplier = (): DeltaSupplier => {
  const supply3dDeltas = use3dDeltaSupplier();
  const supplyLighterDeltas = useLighterDeltaSupplier();
  const supplySidebarDeltas = useSidebarDeltaSupplier();
  const supplyTemporalDetectionDeltas = useTemporalDetectionDeltaSupplier();
  const registeredSuppliers = useRegisteredDeltaSuppliers();

  return useCallback(() => {
    const result3d = supply3dDeltas();
    const resultLighter = supplyLighterDeltas();
    const resultSidebar = supplySidebarDeltas();
    const resultTemporalDetection = supplyTemporalDetectionDeltas();
    const registeredDeltas = registeredSuppliers.flatMap(
      (supply) => supply().deltas
    );

    const deltas = [
      ...result3d.deltas,
      ...resultLighter.deltas,
      ...resultSidebar.deltas,
      ...resultTemporalDetection.deltas,
      ...registeredDeltas,
    ];

    // Metadata for generated views only comes from Lighter
    return { deltas, metadata: resultLighter.metadata };
  }, [
    supply3dDeltas,
    supplyLighterDeltas,
    supplySidebarDeltas,
    supplyTemporalDetectionDeltas,
    registeredSuppliers,
  ]);
};
