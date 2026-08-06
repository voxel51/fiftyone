/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The plugin hosting layer. It carries no component imports, so packages the
 * runtime depends on — notably `@fiftyone/operators` — can import it without a
 * cycle. The runtime components live in `./PluginsRuntime`.
 */

export { setOperatorsRuntime } from "./operators";
export { useOperatorsLoaderState } from "./state";
export {
  PluginRuntimeGate,
  usePluginRuntimeReady,
  usePluginRuntimeStatus,
} from "./status";
export type { PluginRuntimeStatus } from "./status";
export type {
  OperatorContextSelector,
  PluginRuntimeHostContext,
  PluginsLoaderProps,
  PluginsRuntimeProps,
} from "./types";
