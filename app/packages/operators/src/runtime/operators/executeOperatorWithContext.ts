import executeOperatorAsGenerator from "./executeOperatorAsGenerator";
import ExecutionContext from "./ExecutionContext";
import Executor from "./Executor";
import getLocalOrRemoteOperator from "./getLocalOrRemoteOperator";
import handleLocalOperatorExecution from "./handleLocalOperatorExecution";
import OperatorResult from "./OperatorResult";
import { resolveOperatorURIWithMethod } from "./resolveOperator";
import { constructExecutionPayload, executeFetch } from "./utils";

/**
 * Executes an operator with the given execution context.
 * @param uri - The operator URI.
 * @param ctx - The execution context.
 * @returns The result of the operator execution.
 */
export default async function executeOperatorWithContext(
  uri: string,
  ctx: ExecutionContext
): Promise<OperatorResult> {
  const { operatorURI, params } = resolveOperatorURIWithMethod(uri, ctx.params);
  ctx.params = params;
  const { operator, isRemote } = getLocalOrRemoteOperator(operatorURI);

  let result,
    error,
    errorMessage,
    executor,
    delegated = false;

  if (isRemote) {
    if (operator.config.executeAsGenerator) {
      return await executeOperatorAsGenerator(operator, ctx);
    } else {
      const payload = constructExecutionPayload(operator, ctx);
      const serverResult = await executeFetch("/operators/execute", payload);
      result = serverResult.result;
      error = serverResult.error;
      errorMessage = serverResult.error_message;
      executor = serverResult.executor;
      delegated = serverResult.delegated;
    }
  } else {
    await handleLocalOperatorExecution(operator, ctx);
  }

  return finalizeOperatorExecution(
    ctx,
    operator,
    result,
    error,
    errorMessage,
    executor,
    delegated
  );
}

function finalizeOperatorExecution(
  ctx: ExecutionContext,
  operator: Operator,
  result: any,
  error: any,
  errorMessage: string,
  executor: any,
  delegated: boolean
): OperatorResult {
  if (executor && !(executor instanceof Executor)) {
    executor = Executor.fromJSON(executor);
  }

  if (executor) executor.queueRequests();

  return new OperatorResult(
    operator,
    result,
    executor,
    error,
    delegated,
    errorMessage
  );
}
