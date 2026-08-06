import type { PluginScope } from "../PluginScope";
import type { PropsWithChildren } from "react";
import type { RecoilValueReadOnly } from "recoil";

export type OperatorContextSelector = RecoilValueReadOnly<unknown>;

export type PluginRuntimeHostContext = {
  operatorContextSelector: OperatorContextSelector;
  useSpacesContext: () => unknown;
};

export type PluginsRuntimeProps = PropsWithChildren<{
  operatorContextSelector?: OperatorContextSelector;
  useSpacesContext?: () => unknown;
  activeScope?: PluginScope;
  /**
   * Block rendering behind a full screen loader until the runtime is ready.
   * Defaults to false, where children render immediately beside a progress
   * indicator and runtime-dependent code waits via `usePluginRuntimeStatus`,
   * `usePluginRuntimeReady`, or `PluginRuntimeGate`.
   */
  blocking?: boolean;
  datasetLess?: boolean;
  datasetName?: string;
}>;

export type PluginsLoaderProps = PropsWithChildren<{
  blockWhileLoading?: boolean;
}>;
