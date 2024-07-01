import { OperatorResult } from "./operators";

export type ExecutionCallback = (result: OperatorResult) => void;
export type ExecutionErrorCallback = (error: Error) => void;

export type OperatorExecutorOptions = {
  delegationTarget?: string;
  requestDelegation?: boolean;
  skipOutput?: boolean;
  callback?: ExecutionCallback;
};
