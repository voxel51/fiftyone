import { useRecoilState } from "recoil";
import { promptingOperatorState } from "../recoil";
import useExecutionContext from "./useExecutionContext";
import useFetchExecutionOptions from "./useFetchExecutionOptions";
import useResolveInput from "./useResolveInput";
import useValidateInputs from "./useValidateInputs";
import useOperatorPromptState from "./useOperatorPromptState";
import useOperatorPromptSubmitOptions, {
  OperatorPrompt,
} from "./useOperatorPromptSubmitOptions";
import { ExecutionContext } from "../operators";

/**
 * useOperatorPrompt
 *
 * Manages the operator prompt's execution context and state.
 *
 * @returns An object with control functions and state for the operator prompt.
 */
export default function useOperatorPrompt() {
  const [promptingOperator, setPromptingOperator] = useRecoilState(
    promptingOperatorState
  );
  const { operatorName } = promptingOperator || {};
  const ctx = useExecutionContext(operatorName);

  const { execDetails, operator } = useFetchExecutionOptions(operatorName, ctx);
  const { inputFields, resolveInput, close } = useResolveInput(
    ctx,
    operator,
    setPromptingOperator
  );
  const { validationErrors, validateThrottled } = useValidateInputs(operator);
  const {
    containerRef,
    isExecuting,
    hasResultOrError,
    submitOptions,
    handleExecution,
    outputFields,
    showPrompt,
    promptView,
    executorError,
  } = useOperatorPromptState(
    ctx,
    execDetails,
    operator,
    inputFields,
    resolveInput,
    close
  );

  return {
    containerRef,
    inputFields,
    outputFields,
    promptingOperator,
    execute: handleExecution,
    showPrompt,
    isExecuting,
    hasResultOrError,
    close,
    validationErrors,
    validate: validateThrottled,
    executorError,
    execDetails,
    submitOptions,
    promptView,
  };
}
