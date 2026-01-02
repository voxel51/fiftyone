/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { CommandContext, CommandContextManager } from "../context";

/**
 * Hook to access undo and redo.  Provides undo/redo methods and the
 * undo/redo stack states.
 * @returns the undo/redo state...enabled, disabled, undoCount, redoCount
 * and the undo/redo functions
 */
export const useUndoRedo = (context?: CommandContext): {
    undoEnabled: boolean,
    redoEnabled: boolean,
    undo: () => Promise<void>,
    redo: () => Promise<void>,
} => {
    const boundContext = useMemo(()=>{
        if(context){
            return context;
        }
        context = CommandContextManager.instance().getActiveContext();
        return context;
    }, [context]);

    const [undoEnabled, setUndoEnabled] = useState(boundContext.canUndo());
    const [redoEnabled, setRedoEnabled] = useState(boundContext.canRedo());

    useEffect(()=>{
        return boundContext.subscribeUndoState((undoEnabled, redoEnabled)=>{
            setUndoEnabled(undoEnabled);
            setRedoEnabled(redoEnabled);
        });
    }, [boundContext]);

    const undo = useCallback(async () => {
        await boundContext.undo();
    }, []);

    const redo = useCallback(async () => {
        await boundContext.redo();
    }, []);
    return { undoEnabled, redoEnabled, undo, redo }
}