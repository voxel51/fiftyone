import type { OperatorScope } from "@fiftyone/operators";
import type { PropsWithChildren } from "react";

export type PluginsRuntimeProps = PropsWithChildren<{
  operatorContextSelector?: unknown;
  useSpacesContext?: () => unknown;
  activeScope?: OperatorScope;
  datasetLess?: boolean;
  datasetName?: string;
}>;

export type PluginsLoaderProps = PropsWithChildren<{
  blockWhileLoading?: boolean;
}>;
