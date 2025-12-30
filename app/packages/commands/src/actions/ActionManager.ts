/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Action } from "./Action";
import type { Undoable } from "./Undoable";
/**
 * Manages the execution of actions and supports 
 * undo/redo operations through them.
 *
 * Each user action is encapsulated as a Action action object that 
 * implements the execute() method.
 * If the action also supports undo/redo, it must implment the undo() method. 
 * The ActionManager maintains two stacks:
 *
 * - undoStack: Contains executed actions that can be undone
 * - redoStack: Contains undone actions that can be redone
 *
 * When a new action is executed via the execute method:
 * 1. The action's execute method is called.
 * 2. The action is pushed onto the undoStack
 * 3. The redoStack is cleared (since a new action invalidates the redo history)
 *
 * If you execute the action outside of the ActionManager, but still want to 
 * provided undo/redo, use the push() method to push and Undoable on the stack.
 * 
 * When undo() is called:
 * 1. The last action is popped from undoStack
 * 2. The action's undo() method is called
 * 3. The action is pushed onto redoStack
 *
 * When redo() is called:
 * 1. The last action is popped from redoStack
 * 2. The action's execute() method is called
 * 3. The action is pushed onto undoStack
 */

export type UndoStateListener = (undoEnabled: boolean, redoEnabled: boolean) => void;
export type ActionListener = (actionId: string, isUndo: boolean) => void;

export class ActionManager {
  private undoStack: Undoable[] = [];
  private redoStack: Undoable[] = [];
  private maxStackSize = 100;
  private undoListeners = new Array<WeakRef<UndoStateListener>>();
  private actionListeners = new Array<WeakRef<ActionListener>>();

  /**
   * Pushes an undoable action onto the undo stack.
   * @param undoable - The undoable to push.
   */
  push(undoable: Undoable): void {
    this.undoStack.push(undoable);
    this.redoStack = []; // Clear redo stack when new undoable is pushed

    // Limit stack size
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }
    this.fireUndoListeners();
  }

  /**
   * Undoes the last undoable.
   * @returns The undone action, or undefined if no actions to undo.
   */
  async undo(): Promise<Undoable | undefined> {
    const undoable = this.undoStack.pop();
    if (undoable) {
      await undoable.undo();
      this.redoStack.push(undoable);
      this.fireActionListeners(undoable.id, true);
      this.fireUndoListeners();
      return undoable;
    }
    return undefined;
  }

  /**
   * Redoes the last undone undoable action.
   * @returns The redone action, or undefined if no undoable actions to redo.
   */
  async redo(): Promise<Undoable | undefined> {
    const undoable = this.redoStack.pop();
    if (undoable) {
      await undoable.execute();
      this.undoStack.push(undoable);
      this.fireActionListeners(undoable.id, false);
      this.fireUndoListeners();
      return undoable;
    }
    return undefined;
  }

  /**
   * Checks if undo is available.
   * @returns True if undo is available.
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Checks if redo is available.
   * @returns True if redo is available.
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Clears all undo/redo history.
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.fireUndoListeners();
  }

  /**
   * Gets the current undo stack size.
   * @returns Number of undoable actions in undo stack.
   */
  getUndoStackSize(): number {
    return this.undoStack.length;
  }

  async execute(action: Action): Promise<void> {
    await action.execute();
    if ("undo" in action && typeof action.undo === 'function') {
      this.push(action as Undoable);
    }
    this.fireActionListeners(action.id, false);
  }
  /**
   * Gets the current redo stack size.
   * @returns Number of undoable actions in redo stack.
   */
  getRedoStackSize(): number {
    return this.redoStack.length;
  }

  public subscribeUndo(listener: UndoStateListener): () => void {
    const ref = new WeakRef(listener);
    this.undoListeners.push(ref);
    return () => {
      this.undoListeners = this.undoListeners.filter((ref) => {
        const deref = ref.deref();
        if (!deref || listener === deref) {
          return false;
        }
      });
      return true;
    }
  }

  public subscribeActions(listener: ActionListener): () => void {
    const ref = new WeakRef(listener);
    this.actionListeners.push(ref);
    return () => {
      this.actionListeners = this.actionListeners.filter((ref) => {
        const deref = ref.deref();
        if (!deref || listener === deref) {
          return false;
        }
      });
      return true;
    }
  }

  private fireUndoListeners() {
    this.undoListeners = this.undoListeners.filter((ref) => {
      const deref = ref.deref();
      if (!deref) {
        return false;
      }
      deref(this.canUndo(), this.canRedo());
      return true;
    });
  }

  private fireActionListeners(id: string, isUndo: boolean) {
    this.actionListeners = this.actionListeners.filter((ref) => {
      const deref = ref.deref();
      if (!deref) {
        return false;
      }
      deref(id, isUndo);
      return true;
    })
  }
}
