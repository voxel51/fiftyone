import { DeltaSupplier } from "./deltaSupplier";
import { useCallback } from "react";

/**
 * Hook which provides a {@link DeltaSupplier} which captures changes isolated
 * to the annotation sidebar.
 */
export const useSidebarDeltaSupplier = (): DeltaSupplier => {
  // todo
  return useCallback(() => {
    return [];
  }, []);
};
