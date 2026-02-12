import { useCallback, useMemo } from "react";
import { CommandContext, CommandContextManager } from "../context";
import { resolveContext } from "./utils";

/**
 * Hook to get a command context by id.
 * The context is resolved from the fixed stack managed by CommandContextManager.
 *
 * TODO: duct-tape — activate/deactivate are no-ops since the stack is fixed.
 * Kept for API compat. Refactor later.
 */
export const useCommandContext = (
  context?: CommandContext | string,
  inheritCurrent?: boolean
): {
  context: CommandContext;
  activate: () => void;
  deactivate: () => void;
} => {
  const boundContext = useMemo(() => {
    return resolveContext(context, inheritCurrent);
  }, [context, inheritCurrent]);

  // TODO: duct-tape no-ops — stack is fixed, no push/pop needed. Refactor later.
  const activate = useCallback(() => {}, []);
  const deactivate = useCallback(() => {}, []);

  return { context: boundContext.context, activate, deactivate };
};
