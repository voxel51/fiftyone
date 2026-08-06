import type { PluginScope } from "../PluginScope";

type OperatorsRuntime = (
  activeScope: PluginScope | undefined,
  datasetName: string | undefined,
  datasetLess: boolean | undefined,
) => void;

let useOperatorsRuntime: OperatorsRuntime | undefined;

export function setOperatorsRuntime(runtime: OperatorsRuntime) {
  useOperatorsRuntime = runtime;
}

export function usePluginOperatorsRuntime(
  activeScope: PluginScope | undefined,
  datasetName: string | undefined,
  datasetLess?: boolean,
) {
  if (!useOperatorsRuntime) {
    throw new Error("The @fiftyone/operators runtime has not been initialized");
  }

  return useOperatorsRuntime(activeScope, datasetName, datasetLess);
}
