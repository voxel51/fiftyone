/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

/**
 * Provides a unit of execution.  This can
 * be executed by the ActionManager to optionally
 * support automatic undo/redo by implementing the
 * Undable extension of the interface.
 */
export interface Action {
    id: string;
    execute(): Promise<void>;
}

/**
 * Delegates execution to a lambda
 */
export class DelegatingAction implements Action {
    constructor(
        public readonly id: string,
        private readonly execFn: () => Promise<void>
    ) {
    }
    execute(): Promise<void> {
        return this.execFn();
    }
}

