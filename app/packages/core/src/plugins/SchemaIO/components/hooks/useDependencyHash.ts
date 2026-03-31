/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useMemo } from "react";
import { get } from "lodash";

export type DependencyHash = string | null;

/**
 * Computes a stable hash of dependency values from params.
 * Returns null if no dependencies are specified (meaning "only load on mount").
 *
 * @param params - The params object to extract values from
 * @param dependencies - Array of dot-notation paths to watch (e.g., ["make", "filters.category"])
 * @returns A JSON string of dependency values, or null if no dependencies
 */
export function useDependencyHash(
  params: Record<string, unknown>,
  dependencies?: string[]
): DependencyHash {
  return useMemo(() => {
    if (!dependencies || dependencies.length === 0) {
      return null;
    }
    const values = dependencies.map((dep) => get(params, dep));
    return JSON.stringify(values);
  }, [params, dependencies]);
}
