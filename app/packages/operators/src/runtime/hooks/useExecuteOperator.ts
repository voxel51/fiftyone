import { useState, useCallback } from "react";
import {
  ExecutionContext,
  executeOperatorWithContext,
  OperatorResult,
} from "../operators";

type UseExecuteOperatorReturn = {
  hasExecuted: boolean;
  needsOutput: boolean;
  setHasExecuted: (paramOverrides?: object, options?: any) => Promise<void>;
  setNeedsOutput: (value: boolean) => void;
};

/**
 * useExecuteOperator
 *
 * Manages the execution of an operator with a given context.
 *
 * @param uri - The URI of the operator.
 * @param setIsExecuting - Function to set the execution state.
 * @param setResult - Function to set the execution result.
 * @param setError - Function to set the execution error.
 * @param setNeedsOutput - Function to set the needs output state.
 * @param setIsDelegated - Function to set the delegated state.
 * @param handlers - Optional callbacks for handling success and error.
 * @returns An object with execution control functions.
 */
export default function useExecuteOperator(
  uri: string,
  setIsExecuting: (value: boolean) => void,
  setResult: (result: OperatorResult | null) => void,
  setError: (error: Error | null) => void,
  setNeedsOutput: (value: boolean) => void,
  setIsDelegated: (value: boolean) => void,
  handlers: any
): UseExecuteOperatorReturn {
  const [hasExecuted, setHasExecuted] = useState<boolean>(false);
  const [needsOutput, setNeedsOutputState] = useState<boolean>(false);

  const setNeedsOutput = (value: boolean) => setNeedsOutputState(value);

  const execute = useCallback(
    async (paramOverrides: object = {}, options: any = {}) => {
      setIsExecuting(true);
      try {
        const ctx = new ExecutionContext(paramOverrides, {}, {});
        const execResult = await executeOperatorWithContext(uri, ctx);

        setNeedsOutput(execResult.hasOutputContent());
        setResult(execResult);
        setIsDelegated(execResult.delegated);

        handlers.onSuccess?.(execResult);
        options.onSuccess?.(execResult);
      } catch (err) {
        const errorObj = err as Error;
        setError(errorObj);
        handlers.onError?.(errorObj);
        options.onError?.(errorObj);
      } finally {
        setIsExecuting(false);
        setHasExecuted(true);
      }
    },
    [
      uri,
      setIsExecuting,
      setResult,
      setError,
      setNeedsOutputState,
      setIsDelegated,
      handlers,
    ]
  );

  return { hasExecuted, needsOutput, setHasExecuted: execute, setNeedsOutput };
}
