import { getFetchFunction } from "@fiftyone/utilities";
import { resolveOperatorURI } from "./resolveOperator";
import ExecutionOptions from "./ExecutionOptions";

/**
 * Resolves the execution options for a given operator URI.
 *
 * @param operatorURI - The URI of the operator.
 * @param ctx - The execution context.
 * @returns ExecutionOptions - The resolved execution options.
 */
export default async function resolveExecutionOptions(
  operatorURI: string,
  ctx: ExecutionContext
): Promise<ExecutionOptions> {
  const resolvedURI = resolveOperatorURI(operatorURI);
  const {
    currentSample,
    datasetName,
    delegationTarget,
    extended,
    extendedSelection,
    filters,
    params,
    requestDelegation,
    selectedSamples,
    selectedLabels,
    view,
    viewName,
    groupSlice,
  } = ctx;

  const response = await getFetchFunction()(
    "POST",
    "/operators/resolve-execution-options",
    {
      current_sample: currentSample,
      dataset_name: datasetName,
      delegation_target: delegationTarget,
      extended,
      extended_selection: extendedSelection,
      filters,
      operator_uri: resolvedURI,
      params,
      request_delegation: requestDelegation,
      selected: selectedSamples ? Array.from(selectedSamples) : [],
      selected_labels: selectedLabels,
      view,
      view_name: viewName,
      group_slice: groupSlice,
    }
  );

  return new ExecutionOptions(
    response.orchestrator_registration_enabled,
    response.allow_immediate_execution,
    response.allow_delegated_execution,
    response.available_orchestrators.map(ExecutionOptions.fromJSON),
    response.default_choice_to_delegated
  );
}
