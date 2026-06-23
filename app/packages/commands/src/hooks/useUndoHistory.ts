/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useEffect, useState } from "react";
import { CommandContext } from "../context";
import { useCommandContext } from "./useCommandContext";

/**
 * Newest-first descriptions of a context's undo/redo stacks, refreshed whenever
 * the undo state changes. Backs the undo/redo history tooltips.
 */
export const useUndoHistory = (
  context?: CommandContext | string
): { undoStack: string[]; redoStack: string[] } => {
  const { context: boundContext } = useCommandContext(context);

  const [undoStack, setUndoStack] = useState(() =>
    boundContext.describeUndoStack()
  );
  const [redoStack, setRedoStack] = useState(() =>
    boundContext.describeRedoStack()
  );

  useEffect(() => {
    const refresh = () => {
      setUndoStack(boundContext.describeUndoStack());
      setRedoStack(boundContext.describeRedoStack());
    };

    refresh();

    return boundContext.subscribeUndoState(refresh);
  }, [boundContext]);

  return { undoStack, redoStack };
};
