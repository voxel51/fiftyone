/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useCallback, useEffect, useState } from "react";
import { CommandContext } from "../context";
import { resolveContext } from "./utils";

/**
 * hook that exposes the undo/redo state and methods for a given context.
 * @param context The context to use. If not provided, the active context is used.
 * @returns An object containing the undo/redo state and methods.
 * - undoEnabled: true if undo is available
 * - redoEnabled: true if redo is available
 * - undo: method to perform an undo
 * - redo: method to perform a redo
 * - clear: method to clear the undo/redo stack
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
