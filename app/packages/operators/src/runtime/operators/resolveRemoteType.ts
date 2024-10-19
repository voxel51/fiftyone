import ExecutionContext from "./ExecutionContext";
import OperatorResult from "./OperatorResult";
import { constructExecutionPayload, executeFetch } from "./utils";
import * as types from "../../types";

/**
 * Resolves remote type for inputs or outputs.
 * @param operatorURI - The URI of the operator.
 * @param ctx - The execution context.
 * @param target - The target ("inputs" or "outputs") to resolve.
 * @param results - Operator results, if any.
 * @returns The resolved property type.
 */
export default async function resolveRemoteType(
  operatorURI: string,
  ctx: ExecutionContext,
  target: "inputs" | "outputs",
  results: OperatorResult = null
): Promise<types.Property | null> {
  const payload = constructExecutionPayload({ uri: operatorURI } as any, ctx, {
    results: results ? results.result : null,
    target,
  });

  const typeAsJSON = await executeFetch("/operators/resolve-type", payload);

  if (typeAsJSON?.error) {
    throw new Error(typeAsJSON.error);
  }
  return typeAsJSON ? types.Property.fromJSON(typeAsJSON) : null;
}
