import { DeltaSupplier } from "./deltaSupplier";
import { useCallback } from "react";

/**
 * Hook which provides a {@link DeltaSupplier} which captures changes isolated
 * to the 3D annotation context.
 */
export const use3dDeltaSupplier = (): DeltaSupplier => {
  // todo
  return useCallback(() => {
    return [];
  }, []);
};
