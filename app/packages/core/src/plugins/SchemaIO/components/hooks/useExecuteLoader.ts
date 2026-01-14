/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback } from "react";
import { executeOperator } from "@fiftyone/operators";

export type LoaderValue = {
  state: "idle" | "loading" | "loaded" | "errored";
  data?: unknown;
  error?: string;
};

export interface UseExecuteLoaderOptions {
  /** The operator URI to execute (e.g., "@my-plugin/load_data") */
  operator: string | undefined;
  /** Parameters to pass to the operator */
  params: Record<string, unknown>;
  /** The path where the loader value is stored */
  path: string;
  /** Callback to update the loader value */
  onChange: (path: string, value: LoaderValue) => void;
}

/**
 * Returns a stable callback that executes the loader operator
 * and updates state via onChange.
 *
 * The callback:
 * 1. Sets state to "loading"
 * 2. Executes the operator with given params
 * 3. Sets state to "loaded" with data on success, or "errored" on failure
 *
 * @param options - Configuration for the loader execution
 * @returns A callback function to trigger the load
 */
export function useExecuteLoader({
  operator,
  params,
  path,
  onChange,
}: UseExecuteLoaderOptions): () => void {
  return useCallback(() => {
    if (!operator) return;

    onChange(path, { state: "loading" });

    executeOperator(operator, params, {
      callback: (result) => {
        if (result.error) {
          onChange(path, {
            state: "errored",
            error: result.errorMessage || String(result.error),
          });
        } else {
          onChange(path, {
            state: "loaded",
            data: result.result,
          });
        }
      },
    });
  }, [operator, params, path, onChange]);
}
