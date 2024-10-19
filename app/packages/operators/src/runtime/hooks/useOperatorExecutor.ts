import useExecutionState from "./useExecutionState";
import useExecuteOperator from "./useExecuteOperator";
import useExecutionResults from "./useExecutionResults";
import { OperatorResult } from "../operators";

type UseOperatorExecutorOptions = {
  onSuccess?: (result: OperatorResult) => void;
  onError?: (error: Error) => void;
};

type UseOperatorExecutorReturn = {
  isExecuting: boolean;
  hasExecuted: boolean;
  execute: (
    paramOverrides?: object,
    options?: UseOperatorExecutorOptions
  ) => Promise<void>;
  needsOutput: boolean;
  error: Error | null;
  result: OperatorResult | null;
  clear: () => void;
  hasResultOrError: boolean;
  isDelegated: boolean;
};

/**
 * useOperatorExecutor
 *
 * A hook for managing the execution of an operator with a given context.
 *
 * @param uri - The URI of the operator.
 * @param handlers - Optional callbacks for handling success and error.
 * @returns An object with execution state and control functions.
 */
export default function useOperatorExecutor(
  uri: string,
  handlers: UseOperatorExecutorOptions = {}
): UseOperatorExecutorReturn {
  const { isExecuting, setIsExecuting, clearExecutionState } =
    useExecutionState();
  const {
    result,
    error,
    setResult,
    setError,
    hasResultOrError,
    isDelegated,
    setIsDelegated,
    clearResults,
  } = useExecutionResults();
  const { hasExecuted, needsOutput, setHasExecuted, setNeedsOutput } =
    useExecuteOperator(
      uri,
      setIsExecuting,
      setResult,
      setError,
      setNeedsOutput,
      setIsDelegated,
      handlers
    );

  const clear = () => {
    clearExecutionState();
    clearResults();
  };

  return {
    isExecuting,
    hasExecuted,
    execute: setHasExecuted,
    needsOutput,
    error,
    result,
    clear,
    hasResultOrError,
    isDelegated,
  };
}
