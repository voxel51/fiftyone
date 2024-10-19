import { getFetchFunction } from "@fiftyone/utilities";
import InvocationRequest from "./InvocationRequest";
import GeneratedMessage from "./GeneratedMessage";
import Operator from "./Operator";
import ExecutionContext from "./ExecutionContext";
import ExecutionResult from "./ExecutionResult";

/**
 * Formats the selected labels.
 * @param selectedLabels - An array of selected labels.
 * @returns Formatted labels.
 */
export function formatSelectedLabels(selectedLabels: any[]): object[] {
  return selectedLabels
    .map((label) => ({
      field: label.field,
      label_id: label.labelId,
      sample_id: label.sampleId,
      frame_number: label.frameNumber || undefined,
    }))
    .filter((label) => label !== undefined);
}

/**
 * Constructs the payload for operator execution requests.
 * @param operator - The operator instance.
 * @param ctx - The execution context.
 * @param params - Additional params if needed.
 * @returns Payload for the request.
 */
export function constructExecutionPayload(
  operator: Operator,
  ctx: ExecutionContext,
  params: object = {}
) {
  const currentContext = ctx._currentContext;
  return {
    current_sample: currentContext.currentSample,
    dataset_name: currentContext.datasetName,
    delegation_target: currentContext.delegationTarget,
    extended: currentContext.extended,
    extended_selection: currentContext.extendedSelection,
    filters: currentContext.filters,
    operator_uri: operator.uri,
    params: ctx.params || params,
    request_delegation: ctx.requestDelegation,
    selected: Array.from(currentContext.selectedSamples || []),
    selected_labels: formatSelectedLabels(currentContext.selectedLabels),
    view: currentContext.view,
    view_name: currentContext.viewName,
    group_slice: currentContext.groupSlice,
    query_performance: currentContext.queryPerformance,
  };
}

/**
 * Executes a fetch request for operator execution.
 * @param url - The URL for the fetch request.
 * @param payload - The payload for the request.
 * @returns The response from the server.
 */
export async function executeFetch(url: string, payload: object) {
  const fetchFunction = getFetchFunction();
  return await fetchFunction("POST", url, payload);
}

/**
 * Handles a chunk of data during operator execution.
 * @param chunk - The current chunk of data from execution.
 * @param result - The result object to store the processed chunk data.
 * @param executeOperator - The function to execute an operator.
 */
export function handleChunk(
  chunk: any,
  result: { result: any; delegated?: boolean; error?: string },
  executeOperator: (uri: string, params: object) => void
): void {
  if (!chunk) return;

  // Handle delegation
  if (chunk.delegated) {
    result.delegated = chunk.delegated;
  }

  // Handle errors
  if (chunk.error) {
    result.error = chunk.error;
  }

  // Parse the message
  const message = GeneratedMessage.fromJSON(chunk);

  // Handle different message classes
  if (message.cls === InvocationRequest) {
    executeOperator(message.body.operator_uri, message.body.params);
  } else if (message.cls === ExecutionResult) {
    result.result = message.body;
  }
}

/**
 * Checks if a value is null or undefined.
 *
 * @param value - The value to check.
 * @returns {boolean} - True if the value is null or undefined, false otherwise.
 */
export function isNullish(value: any): boolean {
  return value === null || value === undefined;
}
