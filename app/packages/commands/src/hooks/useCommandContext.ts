import { useCallback, useEffect, useMemo } from "react";
import { CommandContext, CommandContextManager } from "../context";
import { resolveContext } from "./utils";

/**
 * Hook to create or bind to an existing context.  Used with useCommand, useKeyBinding to
 * contextualize execution.
 * If the context is created, it will be destroyed on unmount.
 * If the context already existed, it will not be destroyed, as someone else owns it's lifecycle.
 * A context contains the state of the command system for a particular workflow,
 * including registered commands, keybindings and the undo/redo stack.
 * @param context The context or id of an existing context to use
 * @param inheritCurrent If the context is new, true to inherit the parent context
 * @returns The context, and an activate/deactive method to use it.
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

  useEffect(() => {
    return () => {
      if (!boundContext.existed) {
        CommandContextManager.instance().deleteContext(boundContext.context.id);
      }
    };
  }, [boundContext]);

  const activate = useCallback(() => {
    CommandContextManager.instance().pushContext(boundContext.context);
  }, [boundContext.context]);

  const deactivate = useCallback(() => {
    CommandContextManager.instance().popContext(boundContext.context.id);
  }, [boundContext.context.id]);

  return { context: boundContext.context, activate, deactivate };
};
