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
  undo(): void;
}

/**
 * Delegate execute/undo to lambdas
 */
export class DelegatingUndoable extends DelegatingAction implements Undoable {
  private readonly _undoFn: () => void;
  constructor(
    id: string,
    execFn: () => void,
    undoFn: () => void
  ) {
    super(id, execFn);
    this._undoFn = undoFn;
  }
  /**
   * Executes the undoFn passed in the constructor
   */
  undo(): void {
    this._undoFn();
  }
}
