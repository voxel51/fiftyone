import { getTargetOperatorMethod } from "./resolveOperator";

/**
 * Resolves an operator URI with method details.
 * @param operatorURI - The original operator URI.
 * @param params - The parameters associated with the URI.
 * @returns An object containing the resolved operator URI and parameters.
 */
export default function resolveOperatorURIWithMethod(
  operatorURI: string,
  params: object
): { operatorURI: string; params: object } {
  const targetMethod = getTargetOperatorMethod(operatorURI);
  if (targetMethod) {
    params = { ...params, __method__: targetMethod };
  }
  return { operatorURI, params };
}
