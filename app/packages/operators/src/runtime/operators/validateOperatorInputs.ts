import { types } from "../..";
import { ValidationContext, ValidationError } from "../../validation";
import ExecutionContext from "./ExecutionContext";
import Operator from "./Operator";

/**
 * Validates inputs for the given operator.
 * @param operator - The operator instance.
 * @param ctx - The execution context.
 * @param resolvedInputs - The resolved inputs to validate.
 * @returns Validation context and errors.
 */
export default async function validateOperatorInputs(
  operator: Operator,
  ctx: ExecutionContext,
  resolvedInputs: types.Property
): Promise<[ValidationContext, ValidationError[]]> {
  const validationCtx = new ValidationContext(ctx, resolvedInputs, operator);
  const validationErrors = validationCtx.toProps().errors;
  return [validationCtx, validationErrors];
}
