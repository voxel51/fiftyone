import { useCallback, useEffect } from "react";
import { OperatorPromptType } from "../../types";
import { useOperatorPromptWarnings } from "./useOperatorPromptWarnings";
import { SubmitOption } from "../types";
import useOperatorSubmitOptionsState from "./useOperatorSubmitOptionsState";
import { generateSubmitOptions } from "../utils/generateSubmitOptions";
import { UseExecutionOptionsReturn } from "./useExecutionOptions";

type UseOperatorPromptSubmitOptionsProps = {
  operatorURI: string;
  execDetails: UseExecutionOptionsReturn;
  execute: (options?: {
    requestDelegation?: boolean;
    delegationTarget?: string;
  }) => void;
  promptView?: OperatorPromptType["promptView"];
};

type UseOperatorPromptSubmitOptionsReturn = {
  showWarning: boolean;
  warningTitle: string;
  warningMessage: string;
  options: SubmitOption[];
  hasOptions: boolean;
  isLoading: boolean;
  handleSubmit: () => void;
};

/**
 * useOperatorPromptSubmitOptions
 *
 * Manages submission options for the operator prompt.
 */
export default function useOperatorPromptSubmitOptions({
  execDetails,
  execute,
  promptView,
}: UseOperatorPromptSubmitOptionsProps): UseOperatorPromptSubmitOptionsReturn {
  const { executionOptions, isLoading } = execDetails;
  const { options, selectedID, setOptions, setSelectedID } =
    useOperatorSubmitOptionsState();
  const availableOrchestrators = executionOptions?.availableOrchestrators || [];
  const hasAvailableOrchestrators = availableOrchestrators.length > 0;

  const newOptions = generateSubmitOptions({
    executionOptions,
    promptView,
    execute,
  });

  useEffect(() => {
    setOptions(newOptions);
  }, [newOptions, setOptions]);

  const handleSubmit = useCallback(() => {
    const selectedOption = options.find((option) => option.id === selectedID);
    selectedOption?.onClick();
  }, [options, selectedID]);

  const { showWarning, warningTitle, warningMessage } =
    useOperatorPromptWarnings({
      executionOptions,
      hasAvailableOrchestrators,
    });

  return {
    showWarning,
    warningTitle,
    warningMessage,
    options,
    hasOptions: options.length > 0,
    isLoading,
    handleSubmit,
  };
}
