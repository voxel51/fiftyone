import {
  useCallback,
  useState,
  useEffect,
  createContext,
  useContext,
} from "react";
import {
  CommandContext,
  CommandContextManager,
  KnownContexts,
} from "../context";

const ReactCommandContext = createContext<CommandContext | undefined>(
  undefined
);

/**
 * Hook to create and manage the lifecycle of a new `CommandContext`.
 *
 * This hook creates a new context with the given `contextId` on mount and removes it on unmount.
 * It is designed for components that need to establish their own command scope.
 *
 * Behavior:
 * - **Creation**: A new `CommandContext` is created in the `CommandContextManager`.
 * - **Parent Resolution**:
 *   1. If `parent` param is provided, it uses that ID.
 *   2. If not, it looks for a parent `CommandContext` provided via React Context (implicit nesting).
 *   3. Defaults to `KnownContexts.Default`.
 * - **Cleanup**: The context is deleted from the manager when the component unmounts.
 *
 * @param contextId - Unique identifier for the new context. Must be unique within the manager.
 * @param parent - Optional ID of the parent context. If omitted, it is inferred from React Context.
 * @param propagate - Whether unhandled commands/events should propagate to the parent context. Defaults to `true`.
 *
 * @returns An object containing:
 * - `context`: The created `CommandContext` instance.
 * - `activate`: Function to make this context the active one in the manager.
 * - `deactivate`: Function to deactivate this context (if active) and restore the parent.
 * - `Provider`: A React Context Provider to wrap children, enabling recursive parent inference.
 */
export const useCommandContext = (
  contextId: string,
  parent?: string,
  propagate = true
): {
  context: CommandContext | undefined;
  activate: () => void;
  deactivate: () => void;
  Provider: React.Provider<CommandContext | undefined>;
} => {
  const mgr = CommandContextManager.instance();
  const parentCtx = useContext(ReactCommandContext);
  const resolvedParent = parent || parentCtx?.id || KnownContexts.Default;

  const [context] = useState(() => {
    // Synchronously create or retrieve the context on first render
    const existing = mgr.getCommandContext(contextId);
    if (existing) {
      return existing;
    }
    return mgr.createCommandContext(contextId, resolvedParent, propagate);
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
      CommandContextManager.instance().activateContext(contextId);
    }, [contextId]),
    deactivate: useCallback(() => {
      const mgr = CommandContextManager.instance();
      const ctx = mgr.getCommandContext(contextId);
      if (ctx && mgr.getActiveContext().id === ctx.id) {
        mgr.deactivateContext(ctx.id);
      }
    }, [contextId]),
    Provider: ReactCommandContext.Provider,
  };
};
