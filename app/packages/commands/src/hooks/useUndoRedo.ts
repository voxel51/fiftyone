import { useCallback, useEffect, useState } from "react"
import { getActionManager } from "../actions";

/**
 * Hook to access undo and redo.  Provides undo/redo methods and the
 * undo/redo stack states.
 * @returns the undo/redo state...enabled, disabled, undoCount, redoCount
 * and the undo/redo functions
 */
export const useUndoRedo = (): {
    undoEnabled: boolean,
    redoEnabled: boolean,
    undo: () => Promise<void>,
    redo: () => Promise<void>,
    undoCount: number,
    redoCount: number
} => {
    const [undoEnabled, setUndoEnabled] = useState(false);
    const [redoEnabled, setRedoEnabled] = useState(false);
    const [undoCount, setUndoCount] = useState(0);
    const [redoCount, setRedoCount] = useState(0);

    const undo = useCallback(async () => {
        await getActionManager().undo();
    }, []);
    const redo = useCallback(async () => {
        await getActionManager().redo();
    }, []);
    useEffect(() => {
        getActionManager().subscribe((undoEnabled, redoEnabled, undoCount, redoCount) => {
            setUndoEnabled(undoEnabled);
            setRedoEnabled(redoEnabled);
            setUndoCount(undoCount);
            setRedoCount(redoCount);
        });
    });
    return { undoEnabled, redoEnabled, undo, redo, undoCount, redoCount }
}