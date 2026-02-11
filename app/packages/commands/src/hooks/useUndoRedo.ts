/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useCallback, useEffect, useState } from "react";
import { CommandContext } from "../context";
import { resolveContext } from "./utils";

/**
 * Hook to access and observe the undo/redo state of a context.
 *
 * @param context - (Optional) The context to observe.
 *   - Can be a `CommandContext` object or a string ID.
 *   - If undefined, it resolves to the currently active context.
 *
 * @returns An object containing:
 * - `undoEnabled`: Boolean, true if undo is available.
 * - `redoEnabled`: Boolean, true if redo is available.
 * - `undo`: Async function to perform an undo operation.
 * - `redo`: Async function to perform a redo operation.
 * - `clear`: Function to clear the undo/redo stack.
 */
export const useUndoRedo = (
  context?: CommandContext | string
): {
  undoEnabled: boolean;
  redoEnabled: boolean;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
} => {
  const boundContext = resolveContext(context);

  const [undoEnabled, setUndoEnabled] = useState(
    boundContext?.canUndo() ?? false
  );
  const [redoEnabled, setRedoEnabled] = useState(
    boundContext?.canRedo() ?? false
  );

  useEffect(() => {
    if (!boundContext) return;
    return boundContext.subscribeUndoState((undoEnabled, redoEnabled) => {
      setUndoEnabled(undoEnabled);
      setRedoEnabled(redoEnabled);
    });
  }, [boundContext]);

  const undo = useCallback(async () => {
    await boundContext?.undo();
  }, [boundContext]);

  const redo = useCallback(async () => {
    await boundContext?.redo();
  }, [boundContext]);

  const clear = useCallback(() => {
    boundContext?.clearUndoRedoStack();
  }, [boundContext]);

  return { undoEnabled, redoEnabled, undo, redo, clear };
};
