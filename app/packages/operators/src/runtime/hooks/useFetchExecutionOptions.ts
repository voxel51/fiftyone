import { useMemo } from "react";
import {
  ExecutionContext,
  getLocalOrRemoteOperator,
  resolveExecutionOptions,
} from "../operators";
import useExecutionOptions from "./useExecutionOptions";

type UseFetchExecutionOptionsReturn = {
  execDetails: any;
  operator: any;
};

/**
 * useFetchExecutionOptions
 *
 * Fetches the execution options and operator details.
 *
 * @param operatorName - The operator name.
 * @param ctx - The execution context.
 * @returns The execution details and operator object.
 */
export default function useFetchExecutionOptions(
  operatorName: string,
  ctx: ExecutionContext
): UseFetchExecutionOptionsReturn {
  const { operator, isRemote } = getLocalOrRemoteOperator(operatorName);
  const execDetails = useExecutionOptions(operatorName, ctx, isRemote);

  return useMemo(() => ({ execDetails, operator }), [execDetails, operator]);
}
