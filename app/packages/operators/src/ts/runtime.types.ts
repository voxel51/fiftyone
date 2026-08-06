import type { PluginScope } from "@fiftyone/plugins/src/PluginScope";
import { ExecutionContext, OperatorResult } from "../operators";

export type ExecutionCallbackOptions = { ctx: ExecutionContext };
export type ExecutionCallback = (
  result: OperatorResult,
  options: ExecutionCallbackOptions,
) => void;
export type ExecutionErrorCallback = (
  error: OperatorResult,
  options: ExecutionCallbackOptions,
) => void;

export type OperatorExecutorOptions = {
  delegationTarget?: string;
  requestDelegation?: boolean;
  skipOutput?: boolean;
  callback?: ExecutionCallback;
  skipErrorNotification?: boolean;
  // overrides the most recently active scope
  scope?: PluginScope;
};

export type ParamsType = Record<string, unknown>;

export type ResolvablePropertyOptions = {
  resolver: string;
  debounce?: boolean;
  throttle?: boolean;
  wait?: number;
  auto_update?: boolean;
  dependencies?: string[];
  params?: ParamsType;
  validate?: boolean;
  leading?: boolean;
  trailing?: boolean;
};
