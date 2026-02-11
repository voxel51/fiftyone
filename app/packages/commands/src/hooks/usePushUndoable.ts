import { useCallback } from "react";
import { DelegatingUndoable } from "../actions";
import { CommandContextManager } from "../context";

/**
 * Hook to push undoable actions to a specific or active command context.
 *
 * @param contextId - (Optional) The ID of the target command context.
 *   - If provided, it attempts to find the context by ID. Logs a warning if not found.
 *   - If omitted, it defaults to the currently **active** context in the manager.
 *
 * @returns An object containing:
 * - `createPushAndExec`: Helper string to create, execute, and push a `DelegatingUndoable`.
 */
export const usePushUndoable = (contextId?: string) => {
  const createPushAndExec = useCallback(
    (
      id: string,
      execFn: () => void | Promise<void>,
      undoFn: () => void | Promise<void>
    ) => {
      const manager = CommandContextManager.instance();

      let context;
      if (contextId) {
        context = manager.getCommandContext(contextId);
        if (!context) {
          console.warn(
            `usePushUndoable: Context "${contextId}" not found. Skipping undo registration.`
          );
          return;
        }
      } else {
        context = manager.getActiveContext();
      }

      const undoable = new DelegatingUndoable(id, execFn, undoFn);

      try {
        execFn();
        context.pushUndoable(undoable);
      } catch (e) {
        console.error(`usePushUndoable: execFn failed for "${id}"`, e);
        throw e;
      }
    },
    [contextId]
  );

  return {
    /**
     * Creates a DelegatingUndoable, pushes it to the command context, and immediately executes it.
     *
     * @param id - Unique identifier for the action
     * @param execFn - Function to execute immediately and on redo
     * @param undoFn - Function to execute on undo
     */
    createPushAndExec,
  };
};
