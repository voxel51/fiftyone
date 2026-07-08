import { useThree } from "@react-three/fiber";
import { useEffect, type DependencyList } from "react";

/**
 * Requests a frame from the demand-driven R3F canvas whenever the supplied
 * dependencies change.
 */
export function useInvalidateOn(deps: DependencyList): void {
  const invalidate = useThree((state) => state.invalidate);
  // The caller owns the dependency list; this helper only appends the stable
  // canvas invalidator.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => invalidate(), [invalidate, ...deps]);
}
