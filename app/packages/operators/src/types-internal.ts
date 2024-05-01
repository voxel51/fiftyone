import { OperatorResult } from "./operators";

export type ExecutionCallback = (result: OperatorResult) => void;
export type ExecutionErrorCallback = (error: Error) => void;
