import { useCallback, useState } from "react";
import {
  executeOperatorWithContext,
  ExecutionContext,
  getLocalOrRemoteOperator,
  OperatorResult,
  resolveOperatorURI,
} from "../operators";
import useExecutionContext from "./useExecutionContext";
import useCurrentSample from "./useCurrentSample";
import * as fos from "@fiftyone/state";
import { useRecoilCallback } from "recoil";
import { currentContextSelector } from "../recoil";

export default function useOperatorExecutor(uri, handlers: any = {}) {
  uri = resolveOperatorURI(uri, { keepMethod: true });

  const { operator } = getLocalOrRemoteOperator(uri);
  const [isExecuting, setIsExecuting] = useState(false);

  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [hasExecuted, setHasExecuted] = useState(false);
  const [isDelegated, setIsDelegated] = useState(false);

  const [needsOutput, setNeedsOutput] = useState(false);
  const context = useExecutionContext(uri);
  const currentSample = useCurrentSample();
  const hooks = operator.useHooks(context);
  const notify = fos.useNotification();

  const clear = useCallback(() => {
    setIsExecuting(false);
    setError(null);
    setResult(null);
    setHasExecuted(false);
    setNeedsOutput(false);
  }, [setIsExecuting, setError, setResult, setHasExecuted, setNeedsOutput]);

  const execute = useRecoilCallback(
    (state) => async (paramOverrides, options?: OperatorExecutorOptions) => {
      const { delegationTarget, requestDelegation, skipOutput, callback } =
        options || {};
      setIsExecuting(true);
      const { params, ...currentContext } = await state.snapshot.getPromise(
        currentContextSelector(uri)
      );

      const ctx = new ExecutionContext(
        paramOverrides || params,
        { ...currentContext, currentSample },
        hooks
      );
      ctx.state = state;
      ctx.delegationTarget = delegationTarget;
      ctx.requestDelegation = requestDelegation;
      try {
        ctx.hooks = hooks;
        ctx.state = state;
        const result = await executeOperatorWithContext(uri, ctx);
        setNeedsOutput(
          skipOutput ? false : await operator.needsOutput(ctx, result)
        );
        setResult(result.result);
        setError(result.error);
        setIsDelegated(result.delegated);
        handlers.onSuccess?.(result);
        callback?.(result);
      } catch (e) {
        callback?.(new OperatorResult(operator, null, ctx.executor, e, false));
        const isAbortError =
          e.name === "AbortError" || e instanceof DOMException;
        const msg = e.message || "Failed to execute an operation";
        if (!isAbortError) {
          setError(e);
          setResult(null);
          handlers.onError?.(e);
          console.error("Error executing operator", operator, ctx);
          console.error(e);
          notify({ msg, variant: "error" });
        }
      }
      setHasExecuted(true);
      setIsExecuting(false);
    },
    [currentSample, context]
  );
  return {
    isExecuting,
    hasExecuted,
    execute,
    needsOutput,
    error,
    result,
    clear,
    hasResultOrError: result || error,
    isDelegated,
  };
}
