import { useState, useCallback, useEffect } from "react";
import { debounce } from "lodash";
import {
  ExecutionContext,
  Orchestrator,
  resolveExecutionOptions,
} from "../operators";

const EXEC_OPTIONS_RESOLVE_DELAY = 300;

type ExecutionOptions = {
  allowImmediateExecution: boolean;
  allowDelegatedExecution?: boolean;
  availableOrchestrators?: Orchestrator[];
  defaultChoiceToDelegated?: boolean;
};

export type UseExecutionOptionsReturn = {
  isLoading: boolean;
  executionOptions: ExecutionOptions | null;
  fetch: (ctxOverride?: ExecutionContext | null) => Promise<void>;
};

/**
 * useExecutionOptions
 *
 * A hook to fetch and manage execution options for an operator.
 *
 * @param operatorURI - The URI of the operator.
 * @param ctx - The execution context.
 * @param isRemote - Boolean indicating if the operator is remote.
 * @returns {UseExecutionOptionsReturn} - An object containing the loading state, execution options, and a fetch function.
 */
export default function useExecutionOptions(
  operatorURI: string,
  ctx: ExecutionContext,
  isRemote: boolean
): UseExecutionOptionsReturn {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [executionOptions, setExecutionOptions] =
    useState<ExecutionOptions | null>(null);

  const fetch = useCallback(
    debounce(async (ctxOverride: ExecutionContext | null = null) => {
      if (!isRemote) {
        setExecutionOptions({ allowImmediateExecution: true });
        return;
      }
      if (!ctxOverride) setIsLoading(true); // Only show loading if loading the first time
      const options = await resolveExecutionOptions(
        operatorURI,
        ctxOverride || ctx
      );
      setExecutionOptions(options);
      setIsLoading(false);
    }, EXEC_OPTIONS_RESOLVE_DELAY),
    [operatorURI, ctx, isRemote]
  );

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { isLoading, executionOptions, fetch };
}
