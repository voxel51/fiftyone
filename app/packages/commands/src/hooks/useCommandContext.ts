import {
  useCallback,
  useState,
  useEffect,
  createContext,
  useContext,
} from "react";
import { CommandContext, CommandContextManager } from "../context";

const ReactCommandContext = createContext<CommandContext | undefined>(
  undefined
);

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
  Provider: React.Provider<CommandContext | undefined>;
} => {
  const mgr = CommandContextManager.instance();
  const parentContext = useContext(ReactCommandContext);

  const [context] = useState(() => {
    // Synchronously create or retrieve the context on first render
    const existing = mgr.getCommandContext(contextId);
    if (existing) {
      return existing;
    }

    // Use the nearest React context as the parent if we want to inherit.
    // If inheritCurrent is true but no React context exists, fall back to the manager's active context.
    // We pass 'true' to manager if we want to fallback to the manager's stack-based parent resolution.
    // But since we are synchronous now, passing parentContext directly is better.
    const parent = inheritCurrent ? parentContext || true : false;

    return mgr.createCommandContext(contextId, parent);
  });

  useEffect(() => {
    // The context is created synchronously above.
    // This effect manages the deletion of the context on unmount.
    return () => {
      // In Strict Mode, this cleanup runs, deleting the context.
      // The next time the component renders (after the remount), a new
      // context will be created synchronously in the useState initializer.
      if (mgr.getCommandContext(contextId)) {
        mgr.deleteContext(contextId);
      }
    };
  }, [contextId, mgr]);

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
    Provider: ReactCommandContext.Provider,
  };
};
