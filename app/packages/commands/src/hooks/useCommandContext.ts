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
  let effectiveContext = context;

  // If we have a context in state, but it's been deleted from the manager (e.g. by cleanup),
  // we must revive it immediately during render so children can use it.
  if (context && !mgr.getCommandContext(contextId)) {
    effectiveContext = mgr.createCommandContext(
      contextId,
      Boolean(inheritCurrent)
    );
  }

  // Initialize/Create context
  useEffect(() => {
    let ctx = effectiveContext;

    if (!ctx) {
      ctx = mgr.createCommandContext(contextId, Boolean(inheritCurrent));
    }

    // Sync state if needed
    if (context !== ctx) {
      setContext(ctx);
    }

    return () => {
      // In Strict Mode, this cleanup runs, deleting the context.
      // The next render (before effect) will trigger the "revival" logic above.
      mgr.deleteContext(contextId);
    };
  }, [contextId, inheritCurrent]); // Don't include effectiveContext to avoid render loop

  const activate = useCallback(() => {
    const ctx = CommandContextManager.instance().getCommandContext(contextId);
    if (ctx) {
      CommandContextManager.instance().pushContext(ctx);
    }
  }, [contextId]);

  const deactivate = useCallback(() => {
    const ctx = CommandContextManager.instance().getCommandContext(contextId);
    if (ctx) {
      CommandContextManager.instance().popContext(ctx.id);
    }
  }, [contextId]);

  return { context: effectiveContext, activate, deactivate };
};
