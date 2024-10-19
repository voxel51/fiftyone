import { ExecutionOptions } from "../operators";
import { OperatorPromptType } from "../../types";
import { SubmitOption } from "../types";

type GenerateSubmitOptionsParams = {
  executionOptions?: ExecutionOptions;
  promptView?: OperatorPromptType["promptView"];
  execute: (options?: {
    requestDelegation?: boolean;
    delegationTarget?: string;
  }) => void;
};

/**
 * generateSubmitOptions
 *
 * Creates submission options based on execution details and available orchestrators.
 */
export function generateSubmitOptions({
  executionOptions,
  promptView,
  execute,
}: GenerateSubmitOptionsParams): SubmitOption[] {
  const options: SubmitOption[] = [];
  if (!executionOptions) return options;

  const availableOrchestrators = executionOptions?.availableOrchestrators || [];
  const hasAvailableOrchestrators = availableOrchestrators.length > 0;
  const defaultToExecute = executionOptions.allowDelegatedExecution
    ? !executionOptions.defaultChoiceToDelegated
    : true;
  const defaultToSchedule = executionOptions.allowDelegatedExecution
    ? executionOptions.defaultChoiceToDelegated
    : false;

  if (executionOptions.allowImmediateExecution) {
    options.push({
      label: promptView?.submitButtonLabel || "Execute",
      id: "execute",
      default: defaultToExecute,
      description: "Run this operation now",
      onSelect: () => {},
      onClick: () => execute(),
    });
  }

  if (
    executionOptions.allowDelegatedExecution &&
    !executionOptions.orchestratorRegistrationEnabled
  ) {
    options.push({
      label: "Schedule",
      id: "schedule",
      default: defaultToSchedule,
      description: "Schedule this operation to run later",
      onSelect: () => {},
      onClick: () => execute({ requestDelegation: true }),
    });
  }

  if (
    executionOptions.allowDelegatedExecution &&
    hasAvailableOrchestrators &&
    executionOptions.orchestratorRegistrationEnabled
  ) {
    availableOrchestrators.forEach((orc) => {
      options.push({
        label: "Schedule",
        id: orc.id,
        default: false,
        description: `Run this operation on ${orc.instanceID}`,
        onSelect: () => {},
        onClick: () =>
          execute({
            delegationTarget: orc.instanceID,
            requestDelegation: true,
          }),
      });
    });
  }

  return options;
}
