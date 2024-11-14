import { ExecutionContext, OperatorResult } from "./operators";

export type ExecutionCallbackOptions = {ctx: ExecutionContext};
export type ExecutionCallback = (result: OperatorResult, options: ExecutionCallbackOptions) => void;
export type ExecutionErrorCallback = (error: Error) => void;

export type OperatorExecutorOptions = {
  delegationTarget?: string;
  requestDelegation?: boolean;
  skipOutput?: boolean;
  callback?: ExecutionCallback;
};
