/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { isUndoable } from "../utils";
import type { Action } from "./Action";
import type { Undoable } from "./Undoable";

export type UndoStateListener = (
  undoEnabled: boolean,
  redoEnabled: boolean
) => void;

export type ActionListener = (actionId: string, isUndo: boolean) => void;

/**
 * Manages the execution of actions and supports
 * undo/redo operations through them.
 *
 * Each user action is encapsulated as a Action action object that
 * implements the execute() method.
 * If the action also supports undo/redo, it must implement the undo() method.
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
export class ActionManager {
  private undoStack: Undoable[] = [];
  private redoStack: Undoable[] = [];
  private maxStackSize = 100;
  private undoListeners = new Set<UndoStateListener>();
  private actionListeners = new Set<ActionListener>();

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
   * @returns True if the undo was successful, false otherwise.
   */
  async undo(): Promise<boolean> {
    const undoable = this.undoStack.pop();
    if (undoable) {
      try {
        await undoable.undo();
        this.redoStack.push(undoable);
        this.fireActionListeners(undoable.id, true);
        this.fireUndoListeners();
        return true;
      } catch (error) {
        console.error(`An exception ocurred during undo execution for undoable ${undoable.id}`);
        console.error(error);
        this.fireUndoListeners();
        return false;
      }
    }
    return false;
  }

  /**
   * Redoes the last undone undoable action.
   * @returns True is the redo was successful, false otherwise.
   */
  async redo(): Promise<boolean> {
    const undoable = this.redoStack.pop();
    if (undoable) {
      try {
        await undoable.execute();
        this.undoStack.push(undoable);
        this.fireActionListeners(undoable.id, false);
        this.fireUndoListeners();
        return true;
      } catch (error) {
        console.error(`An exception occurred during redo execution for undoable ${undoable.id}`);
        console.error(error);
        this.fireUndoListeners();
        return false;
      }
    }
    return false;
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

  /**
   * Executes an action in this context and
   * if it is Undoable, pushes it to the undo
   * stack.
   * @param action The action to execute
   */
  async execute(action: Action): Promise<void> {
    await action.execute();
    if (isUndoable(action)) {
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

  /**
   * Registers a listener that is notified of
   * any changes to the undo/redo state.
   * @param listener The undo state listener
   * @returns An unsubscribe callback
   */
  public subscribeUndo(listener: UndoStateListener): () => void {
    this.undoListeners.add(listener);
    return () => {
      this.undoListeners.delete(listener);
    };
  }

  /**
   * Registers a listener that is called when
   * any action is executed, providing the command
   * id and whether is was an undo or not.
   * @param listener The action listener
   * @returns An unsubscribe callback
   */
  public subscribeActions(listener: ActionListener): () => void {
    this.actionListeners.add(listener);
    return () => {
      this.actionListeners.delete(listener);
    };
  }

  private fireUndoListeners() {
    this.undoListeners.forEach((l) => {
      l(this.canUndo(), this.canRedo());
    });
  }

  private fireActionListeners(id: string, isUndo: boolean) {
    this.actionListeners.forEach((listener) => {
      listener(id, isUndo);
    });
  }
}
