import ExecutionContext from "./ExecutionContext";
import Operator from "./Operator";
import validateOperatorInputs from "./validateOperatorInputs";

/**
 * Handles the execution of a local operator within the given context.
 *
 * @param operator - The operator to execute.
 * @param ctx - The execution context.
 * @returns The result of the operator execution.
 * @throws Error if the operator inputs are invalid or if execution fails.
 */
export default async function handleLocalOperatorExecution(
  operator: Operator,
  ctx: ExecutionContext
): Promise<any> {
  // Resolve inputs for the operator
  const resolvedInputs = await operator.resolveInput(ctx);

  // Validate the inputs
  const [validationContext, validationErrors] = await validateOperatorInputs(
    operator,
    ctx,
    resolvedInputs
  );

  // Throw error if inputs are invalid
  if (validationContext.invalid) {
    console.error(`Invalid inputs for operator ${operator.uri}:`);
    console.error(validationErrors);
    throw new Error(
      `Failed to execute operator ${operator.uri}. See console for details.`
    );
  }

  // Attempt to execute the operator
  try {
    return await operator.execute(ctx);
  } catch (error) {
    console.error(`Error executing operator ${operator.uri}:`);
    console.error(error);
    throw error;
  }
}
