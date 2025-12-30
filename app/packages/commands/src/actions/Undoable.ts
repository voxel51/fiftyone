/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Action, DelegatingAction } from "./Action";

/**
 * Provides an undoable unit of execution.
 * This is used by the ActionManager to support
 * undo/redo
 */
export interface Undoable extends Action {
    undo(): Promise<void>;
}

/**
 * Delegate execute/undo to lambdas
 */
export class DelegatingUndoable extends DelegatingAction implements Undoable {
    private _undoFn: () => Promise<void>;
    constructor(id: string,
        execFn: () => Promise<void>,
        undoFn: () => Promise<void>) {
        super(id, execFn);
        this._undoFn = undoFn;
    }

    undo(): Promise<void> {
        return this._undoFn();
    }
}