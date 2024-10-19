import { useRef, useState, useCallback, useMemo } from "react";
import { ExecutionContext, Operator } from "../operators";
import useOperatorExecutor from "./useOperatorExecutor";
import useOperatorPromptSubmitOptions, {
  OperatorPrompt,
} from "./useOperatorPromptSubmitOptions";

type UseOperatorPromptStateReturn = {
  containerRef: React.RefObject<HTMLDivElement>;
  isExecuting: boolean;
  hasResultOrError: boolean;
  submitOptions: OperatorPrompt;
  handleExecution: () => void;
  outputFields: any;
  showPrompt: boolean;
  promptView: any;
  executorError: Error | null;
};

/**
 * useOperatorPromptState
 *
 * Manages the state and execution of the operator prompt.
 *
 * @param ctx - The execution context.
 * @param execDetails - The execution details.
 * @param operator - The operator object.
 * @param inputFields - The input fields.
 * @param resolveInput - The resolve input function.
 * @param close - The close function.
 * @returns The state and control functions for the operator prompt.
 */
export default function useOperatorPromptState(
  ctx: ExecutionContext,
  execDetails: any,
  operator: Operator,
  inputFields: any,
  resolveInput: (ctx: ExecutionContext) => void,
  close: () => void
): UseOperatorPromptStateReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const executor = useOperatorExecutor(operator.uri);
  const submitOptions = useOperatorPromptSubmitOptions(
    operator.uri,
    execDetails,
    executor.execute,
    inputFields?.view
  );

  const [outputFields, setOutputFields] = useState<any>();

  const handleExecution = useCallback(() => {
    submitOptions.handleSubmit();
  }, [submitOptions]);

  useMemo(() => {
    if (executor.result) {
      setOutputFields(executor.result);
    }
  }, [executor.result]);

  return {
    containerRef,
    isExecuting: executor.isExecuting,
    hasResultOrError: executor.hasResultOrError,
    submitOptions,
    handleExecution,
    outputFields,
    showPrompt:
      !!inputFields && !executor.isExecuting && !executor.hasResultOrError,
    promptView: inputFields?.view,
    executorError: executor.error,
  };
}
