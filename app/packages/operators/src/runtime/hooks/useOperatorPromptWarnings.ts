type UseOperatorPromptWarningsParams = {
  executionOptions: ExecutionOptions;
  hasAvailableOrchestrators: boolean;
};

/**
 * useOperatorPromptWarnings
 *
 * Manages the warning state related to orchestrator availability.
 */
export function useOperatorPromptWarnings({
  executionOptions,
  hasAvailableOrchestrators,
}: UseOperatorPromptWarningsParams) {
  const showWarning =
    executionOptions.orchestratorRegistrationEnabled &&
    !hasAvailableOrchestrators;
  const warningMessage =
    "There are no available orchestrators to schedule this operation. Please contact your administrator to add an orchestrator.";

  return {
    showWarning,
    warningTitle: "No available orchestrators",
    warningMessage,
  };
}
