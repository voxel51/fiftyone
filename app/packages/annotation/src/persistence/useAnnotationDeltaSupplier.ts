import type { DeltaSupplier } from "./deltaSupplier";
import { useCallback } from "react";
import { useSidebarDeltaSupplier } from "./useSidebarDeltaSupplier";
import { use3dDeltaSupplier } from "./use3dDeltaSupplier";

/**
 * Hook which aggregates captured annotation deltas from the surfaces that are
 * not yet event-driven (3D working sets, sidebar staged mutations). 2D canvas
 * edits are recorded directly into the pending-edits store at edit time (see
 * useRecordLabelEdits) and need no flush-time capture.
 */
export const useAnnotationDeltaSupplier = (): DeltaSupplier => {
  const supply3dDeltas = use3dDeltaSupplier();
  const supplySidebarDeltas = useSidebarDeltaSupplier();

  return useCallback(
    () => ({
      deltas: [...supply3dDeltas().deltas, ...supplySidebarDeltas().deltas],
    }),
    [supply3dDeltas, supplySidebarDeltas]
  );
};
