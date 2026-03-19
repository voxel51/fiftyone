import { useCallback } from "react";
import { DelegatingUndoable } from "../actions";
import { CommandContextManager } from "../context";

/**
 * Hook that provides a convenient way to push undoable actions to a command context.
 *
 * @param contextId - Optional ID of a specific command context to push undoables to.
 *   If provided, the hook will attempt to find this context by ID. If the context
 *   doesn't exist, a warning will be logged and the operation will be skipped.
 *   If not provided, undoables are pushed to the currently active context.
 * @returns Object containing the createAndPushUndoable function
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
