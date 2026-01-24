/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useRef, useCallback } from "react";
import type { DependencyHash } from "./useDependencyHash";

export type LoaderState = "idle" | "loading" | "loaded" | "errored";

export interface UseLoadTriggerResult {
  /** Whether the loader should execute now */
  shouldLoad: boolean;
  /** Call this after triggering a load to update internal tracking state */
  markLoaded: () => void;
}

/**
 * Determines if the loader should execute based on:
 * - First mount (always load once)
 * - Dependency changes (only if dependencies are specified)
 * - Not currently loading (prevents duplicate requests)
 *
 * @param state - Current loader state
 * @param dependencyHash - Hash of dependency values (null = no dependencies)
 * @returns Object with shouldLoad boolean and markLoaded callback
 */
export function useLoadTrigger(
  state: LoaderState,
  dependencyHash: DependencyHash
): UseLoadTriggerResult {
  const hasLoadedOnceRef = useRef(false);
  const lastHashRef = useRef<DependencyHash | undefined>(undefined);

  const isFirstLoad = !hasLoadedOnceRef.current;
  const isLoading = state === "loading";

  // Dependencies changed only matters if we have dependencies
  const depsChanged =
    dependencyHash !== null && lastHashRef.current !== dependencyHash;

  const shouldLoad = !isLoading && (isFirstLoad || depsChanged);

  const markLoaded = useCallback(() => {
    hasLoadedOnceRef.current = true;
    lastHashRef.current = dependencyHash;
  }, [dependencyHash]);

  return { shouldLoad, markLoaded };
}
