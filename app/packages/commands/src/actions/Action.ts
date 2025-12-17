/**
 * Provides a unit of execution.  The can
 * be executed by the ActionManager to optionally
 * support automatic undo/redo by implementing the
 * Undable extension of the interface.
 */
export interface Action {
    execute(): Promise<void>;
}

/**
 * Delegates execution to a lambda
 */
export class DelegatingAction implements Action {
    private _execFn;
    constructor(
        execFn: () => Promise<void>
    ) {
        this._execFn = execFn;
    }
    execute(): Promise<void> {
        return this._execFn();
    }
}

