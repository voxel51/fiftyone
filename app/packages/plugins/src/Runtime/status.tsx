/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { PropsWithChildren, ReactNode } from "react";
import { selector, useRecoilValue } from "recoil";
import { operatorsLoaderAtom, pluginsLoaderAtom } from "./state";

export type PluginRuntimeStatus = {
  isLoading: boolean;
  hasError: boolean;
  ready: boolean;
};

/**
 * Derived from the loader atoms rather than published by the runtime, so the
 * status cannot drift from what the loaders actually did and is correct even
 * where no runtime is mounted.
 */
const pluginRuntimeStatus = selector<PluginRuntimeStatus>({
  key: "pluginRuntimeStatus",
  get: ({ get }) => {
    const plugins = get(pluginsLoaderAtom);
    const operators = get(operatorsLoaderAtom);

    return {
      isLoading: plugins === "loading" || operators === "loading",
      hasError: plugins === "error" || operators === "error",
      ready: plugins === "ready" && operators === "ready",
    };
  },
});

/**
 * Pending until the runtime is ready. Recoil re-evaluates it whenever a loader
 * atom changes, which both settles and re-arms suspension.
 */
const pluginRuntimeReady = selector<true>({
  key: "pluginRuntimeReady",
  get: ({ get }) => {
    if (get(pluginRuntimeStatus).ready) return true;
    return new Promise<true>(() => {});
  },
});

/**
 * Read the initialization status of the plugin runtime. Use it to decide
 * whether runtime-dependent logic can run yet.
 */
export function usePluginRuntimeStatus(): PluginRuntimeStatus {
  return useRecoilValue(pluginRuntimeStatus);
}

/**
 * Suspend the calling component until the plugin runtime is ready. Requires a
 * `Suspense` boundary above the caller.
 */
export function usePluginRuntimeReady() {
  useRecoilValue(pluginRuntimeReady);
}

/** Render `children` only once the plugin runtime is ready. */
export function PluginRuntimeGate({
  children,
  fallback = null,
}: PropsWithChildren<{ fallback?: ReactNode }>) {
  const { ready } = usePluginRuntimeStatus();
  return <>{ready ? children : fallback}</>;
}
