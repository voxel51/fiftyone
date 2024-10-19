import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { globalContextSelector } from "../recoil";
import { ExecutionContext } from "../operators";
import { RawContext } from "../operators/ExecutionContext";

/**
 * useGlobalExecutionContext
 *
 * @returns {ExecutionContext} - The generated global execution context.
 */
export default function useGlobalExecutionContext(): ExecutionContext {
  // Use Recoil to get the global context from the selector
  const globalCtx = useRecoilValue<RawContext>(globalContextSelector);

  // Memoize the creation of the execution context
  const ctx = useMemo(() => {
    return new ExecutionContext({}, globalCtx);
  }, [globalCtx]);

  return ctx;
}
