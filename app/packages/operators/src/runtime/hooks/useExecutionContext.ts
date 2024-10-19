import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { currentContextSelector } from "../recoil";
import { ExecutionContext } from "../operators";

/**
 * useExecutionContext
 *
 * @param operatorName - The name of the operator to create a context for.
 * @param hooks - Additional hooks to add to the context.
 * @returns {ExecutionContext} - The generated execution context.
 */
const useExecutionContext = (
  operatorName: string,
  hooks: object = {}
): ExecutionContext => {
  const curCtx = useRecoilValue(currentContextSelector(operatorName));

  const ctx = useMemo(() => {
    return new ExecutionContext({ ...curCtx.params }, { ...curCtx }, hooks);
  }, [curCtx, hooks]);

  return ctx;
};

export default useExecutionContext;
