import type { PluginScope } from "../PluginScope";
import type { PropsWithChildren } from "react";
import type { RecoilValueReadOnly } from "recoil";

export type OperatorContextSelector = RecoilValueReadOnly<any>;

export type PluginsRuntimeProps = PropsWithChildren<{
  operatorContextSelector?: OperatorContextSelector;
  useSpacesContext?: () => unknown;
  activeScope?: PluginScope;
  datasetLess?: boolean;
  datasetName?: string;
}>;

export type PluginsLoaderProps = PropsWithChildren<{
  blockWhileLoading?: boolean;
}>;
