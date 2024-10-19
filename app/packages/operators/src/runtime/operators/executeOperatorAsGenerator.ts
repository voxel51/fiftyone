import { getAbortableOperationQueue } from "./AbortableOperation";
import ExecutionContext from "./ExecutionContext";
import Operator from "./Operator";
import OperatorResult from "./OperatorResult";
import { constructExecutionPayload, executeFetch, handleChunk } from "./utils";

/**
 * Executes an operator as a generator.
 * @param operator - The operator instance.
 * @param ctx - The execution context.
 * @returns The result of the generator execution.
 */
export default async function executeOperatorAsGenerator(
  operator: Operator,
  ctx: ExecutionContext
): Promise<OperatorResult> {
  const payload = constructExecutionPayload(operator, ctx);
  const parser = await executeFetch(
    "/operators/execute/generator",
    payload,
    "json-stream"
  );

  const abortQueue = getAbortableOperationQueue();
  abortQueue.add(operator.uri, ctx.params, parser);

  const result = { result: {} };
  await parser.parse((chunk) =>
    handleChunk(chunk, result, operator.uri, ctx.params)
  );

  abortQueue.remove(operator.uri);
  return result;
}
