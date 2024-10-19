import { OperatorExecutorOptions } from "../../types-internal";
import InvocationRequest from "./InvocationRequest";
import { getInvocationRequestQueue } from "./InvocationRequestQueue";
import {
  resolveOperatorURIWithMethod,
  resolveOperatorURI,
} from "./resolveOperator";

/**
 * Adds an operator execution request to the invocation queue.
 * @param uri - The operator URI.
 * @param params - Parameters for the operator.
 * @param options - Additional execution options.
 */
export default function executeOperator(
  uri: string,
  params: unknown = {},
  options?: OperatorExecutorOptions
): void {
  const { operatorURI, params: computedParams } = resolveOperatorURIWithMethod(
    uri,
    params
  );
  const resolvedOperatorURI = resolveOperatorURI(operatorURI);

  const queue = getInvocationRequestQueue();
  const request = new InvocationRequest(
    resolvedOperatorURI,
    computedParams,
    options
  );
  queue.add(request);
}
