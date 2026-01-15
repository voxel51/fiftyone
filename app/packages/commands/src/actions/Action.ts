/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

/**
 * Provides a unit of execution.  This can
 * be executed by the ActionManager to optionally
 * support automatic undo/redo by implementing the
 * Undoable extension of the interface.
 */
export interface Action {
  id: string;
  /**
   * Executes the action
   */
  execute(): void;
}

/**
 * Delegates execution to a lambda
 */
export class DelegatingAction implements Action {
  constructor(
    public readonly id: string,
    private readonly execFn: () => void
  ) { }
  /**
   * Executes the delegate function
   * passed in the constructor
   */
  execute(): void {
    this.execFn();
  }
}
