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
  undo(): void | Promise<void>;
  /** Optional human-readable description for the undo/redo history view. */
  describe?(): string;
}

/**
 * Delegate execute/undo to lambdas, with an optional lazy description for the
 * history view (lazy so a mutated source — e.g. a coalesced undo unit — reads
 * current).
 */
export class DelegatingUndoable extends DelegatingAction implements Undoable {
  private readonly _undoFn: () => void | Promise<void>;
  private readonly _describeFn?: () => string;
  constructor(
    id: string,
    execFn: () => void | Promise<void>,
    undoFn: () => void | Promise<void>,
<<<<<<< HEAD
=======
    describeFn?: () => string,
>>>>>>> main
  ) {
    super(id, execFn);
    this._undoFn = undoFn;
    this._describeFn = describeFn;
  }
  /**
   * Executes the undoFn passed in the constructor
   */
  undo(): void | Promise<void> {
    return this._undoFn();
  }
  /**
   * The description from the describeFn passed in the constructor, if any.
   */
  describe(): string {
    return this._describeFn?.() ?? this.id;
  }
}
