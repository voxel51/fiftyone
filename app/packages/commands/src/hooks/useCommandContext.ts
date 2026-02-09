import { useCallback, useState, useEffect } from "react";
import { CommandContext, CommandContextManager } from "../context";

/**
 * Hook to create and manage a NEW command context for a component.
 *
 * This hook manages the lifecycle of a CommandContext for the given `contextId`.
 * It strictly creates the context on mount and cleans it up on unmount.
 *
 * IMPORTANT: The `contextId` must be unique. If a context with the same ID
 * already exists in the CommandContextManager, this hook will throw an error.
 *
 * It provides:
 * - `context`: The effective CommandContext instance.
 * - `activate`: Function to push this context onto the stack.
 * - `deactivate`: Function to pop this context from the stack.
 *
 * @param contextId Unique identifier for the new context
 * @param inheritCurrent Whether to inherit commands/keybindings from the currently active context
 */
export const useCommandContext = (
  contextId: string,
  inheritCurrent?: boolean
): {
  context: CommandContext | undefined;
  activate: () => void;
  deactivate: () => void;
} => {
  const [context, setContext] = useState<CommandContext>();

  const mgr = CommandContextManager.instance();

  // Initialize/Create context
  // Use useLayoutEffect to ensure context is created before layout paints/children effects,
  // helping with avoiding flashes or missing context issues in consumers.
  useEffect(() => {
    let ctx = context;
    if (!ctx || !mgr.getCommandContext(contextId)) {
      // If context is missing in state OR missing in manager (e.g. Strict Mode cleanup),
      // create (or re-create) it.
      ctx = mgr.createCommandContext(contextId, Boolean(inheritCurrent));
      setContext(ctx);
    }

    return () => {
      // In Strict Mode, this cleanup runs, deleting the context.
      // The next effect run will re-create it.
      // We check manager presence to be safe, though usage implies ownership.
      if (mgr.getCommandContext(contextId)) {
        mgr.deleteContext(contextId);
      }
    };
  }, [contextId, inheritCurrent]);

  // We return undefined initially if not yet created.
  // Consumers must handle context potentially being undefined on first render.
  return {
    context:
      context && mgr.getCommandContext(contextId) === context
        ? context
        : undefined,
    activate: useCallback(() => {
      const ctx = CommandContextManager.instance().getCommandContext(contextId);
      if (ctx) {
        CommandContextManager.instance().pushContext(ctx);
      }
    }, [contextId]),
    deactivate: useCallback(() => {
      const ctx = CommandContextManager.instance().getCommandContext(contextId);
      if (ctx) {
        CommandContextManager.instance().popContext(ctx.id);
      }
    }, [contextId]),
  };
};
