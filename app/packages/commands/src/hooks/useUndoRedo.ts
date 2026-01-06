/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useCallback, useEffect, useState } from "react"
import { CommandContext } from "../context";
import { useCommandContext } from "./useCommandContext";
/**
 * Hook to access undo and redo.  Provides undo/redo methods and the
 * undo/redo stack states.  The clear method clears the undo/redo stack.
 * @returns the undo/redo state...enabled, disabled, undoCount, redoCount
 * and the undo/redo functions.  clear method to clear the undo/redo stack.
 */
export const useUndoRedo = (context?: CommandContext): {
    undoEnabled: boolean,
    redoEnabled: boolean,
    undo: () => Promise<void>,
    redo: () => Promise<void>,
    clear: ()=> void
} => {
    const { context: boundContext, activate, deactivate }= useCommandContext(context);

    const [undoEnabled, setUndoEnabled] = useState(boundContext.canUndo());
    const [redoEnabled, setRedoEnabled] = useState(boundContext.canRedo());

    useEffect(()=>{
        return boundContext.subscribeUndoState((undoEnabled, redoEnabled)=>{
            setUndoEnabled(undoEnabled);
            setRedoEnabled(redoEnabled);
        });
    }, [boundContext]);

    useEffect(()=>{
        activate();
        return deactivate;
    }, [activate, deactivate])

    const undo = useCallback(async () => {
        await boundContext.undo();
    }, [boundContext]);

    const redo = useCallback(async () => {
        await boundContext.redo();
    }, [boundContext]);

    const clear = useCallback(()=>{
        boundContext.clearUndoRedoStack();
    }, [boundContext]);

    return { undoEnabled, redoEnabled, undo, redo, clear }
}