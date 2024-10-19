import ExecutionContext from "./ExecutionContext";
import { getFetchFunction } from "@fiftyone/utilities";
import OperatorResult from "./OperatorResult";
import * as types from "../../types";

const HASH = "#";

/**
 * Resolves the base URI of an operator, removing any method suffix if specified.
 *
 * @param operatorURI - The URI of the operator.
 * @param options - Optional parameters for keeping the method in the URI.
 * @returns The resolved operator URI.
 */
export function resolveOperatorURI(
  operatorURI: string,
  { keepMethod = false } = {}
): string {
  if (!operatorURI) throw new Error("Operator URI is required");
  if (!keepMethod && operatorURI.includes(HASH)) {
    operatorURI = operatorURI.split(HASH)[0];
  }
  if (operatorURI.includes("/")) return operatorURI;
  return `@voxel51/operators/${operatorURI}`;
}

/**
 * Extracts the method from an operator URI.
 *
 * @param operatorURI - The operator URI to extract the method from.
 * @returns The extracted method, or null if none is found.
 */
export function getTargetOperatorMethod(operatorURI: string): string | null {
  if (operatorURI && operatorURI.includes(HASH)) {
    const parts = operatorURI.split(HASH);
    return parts[1];
  }
  return null;
}

/**
 * Resolves an operator URI and optionally includes a target method in the params.
 *
 * @param operatorURI - The operator URI.
 * @param params - The parameters for the operator.
 * @returns An object containing the resolved operator URI and modified params.
 */
export function resolveOperatorURIWithMethod(
  operatorURI: string,
  params: object
): { operatorURI: string; params: object } {
  const targetMethod = getTargetOperatorMethod(operatorURI);
  if (targetMethod) {
    params = { ...params, __method__: targetMethod };
  }
  return { operatorURI, params };
}

/**
 * Resolves the input or output type of a remote operator.
 *
 * @param operatorURI - The operator URI.
 * @param ctx - The execution context.
 * @param target - The target type ("inputs" or "outputs").
 * @param results - Optional results from a previous operator execution.
 * @returns The resolved type as a Property object.
 */
export async function resolveRemoteType(
  operatorURI: string,
  ctx: ExecutionContext,
  target: "inputs" | "outputs",
  results: OperatorResult = null
): Promise<types.Property | null> {
  operatorURI = resolveOperatorURI(operatorURI);
  const currentContext = ctx._currentContext;

  const typeAsJSON = await getFetchFunction()(
    "POST",
    "/operators/resolve-type",
    {
      current_sample: currentContext.currentSample,
      dataset_name: currentContext.datasetName,
      delegation_target: currentContext.delegationTarget,
      extended: currentContext.extended,
      extended_selection: currentContext.extendedSelection,
      filters: currentContext.filters,
      operator_uri: operatorURI,
      params: ctx.params,
      request_delegation: ctx.requestDelegation,
      results: results ? results.result : null,
      target,
      selected: currentContext.selectedSamples
        ? Array.from(currentContext.selectedSamples)
        : [],
      selected_labels: formatSelectedLabels(currentContext.selectedLabels),
      view: currentContext.view,
      view_name: currentContext.viewName,
      group_slice: currentContext.groupSlice,
    }
  );

  if (typeAsJSON && typeAsJSON.error) {
    throw new Error(typeAsJSON.error);
  }
  if (typeAsJSON && (typeAsJSON.name || typeAsJSON.type)) {
    return types.Property.fromJSON(typeAsJSON);
  }
  return null;
}

/**
 * Formats selected labels into a structured JSON format.
 *
 * @param selectedLabels - The selected labels to format.
 * @returns An array of formatted labels.
 */
function formatSelectedLabels(selectedLabels: any[]): object[] {
  const labels = [];
  if (Array.isArray(selectedLabels) && selectedLabels.length > 0) {
    return selectedLabels.map((label) => {
      const formattedLabel = {
        field: label.field,
        label_id: label.labelId,
        sample_id: label.sampleId,
      };
      if (!isNullish(label.frameNumber)) {
        formattedLabel.frame_number = label.frameNumber;
      }
      return formattedLabel;
    });
  }
  return labels;
}
