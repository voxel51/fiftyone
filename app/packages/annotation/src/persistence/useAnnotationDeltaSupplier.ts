import type { DeltaSupplier } from "./deltaSupplier";
import { useLighterDeltaSupplier } from "./useLighterDeltaSupplier";
import { useCallback } from "react";
import { useSidebarDeltaSupplier } from "./useSidebarDeltaSupplier";
import { use3dDeltaSupplier } from "./use3dDeltaSupplier";
import { useTemporalDetectionDeltaSupplier } from "./useTemporalDetectionDeltaSupplier";
import { useVideoLabelsDeltaSupplier } from "./useVideoLabelsDeltaSupplier";

/**
 * Hook which provides a {@link DeltaSupplier} containing an aggregation of
 * deltas from all annotation sources.
 */
export const useAnnotationDeltaSupplier = (): DeltaSupplier => {
  const supply3dDeltas = use3dDeltaSupplier();
  const supplyLighterDeltas = useLighterDeltaSupplier();
  const supplySidebarDeltas = useSidebarDeltaSupplier();
  const supplyTemporalDetectionDeltas = useTemporalDetectionDeltaSupplier();
  const supplyVideoLabelsDeltas = useVideoLabelsDeltaSupplier();

  return useCallback(() => {
    const result3d = supply3dDeltas();
    const resultLighter = supplyLighterDeltas();
    const resultSidebar = supplySidebarDeltas();
    const resultTemporalDetection = supplyTemporalDetectionDeltas();
    const resultVideoLabels = supplyVideoLabelsDeltas();

    const deltas = [
      ...result3d.deltas,
      ...resultLighter.deltas,
      ...resultSidebar.deltas,
      ...resultTemporalDetection.deltas,
      ...resultVideoLabels.deltas,
    ];

    // Metadata for generated views only comes from Lighter
    return { deltas, metadata: resultLighter.metadata };
  }, [
    supply3dDeltas,
    supplyLighterDeltas,
    supplySidebarDeltas,
    supplyTemporalDetectionDeltas,
    supplyVideoLabelsDeltas,
  ]);
};
