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

export type ActionManagerListener = (undoEnabled: boolean, redoEnabled: boolean, undoCount: number, redoCount: number) => void;

export class ActionManager {
  private undoStack: Undoable[] = [];
  private redoStack: Undoable[] = [];
  private maxStackSize = 100;
  private listeners = new Set<ActionManagerListener>();

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
    this.fireListeners();
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
      this.fireListeners();
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
      this.fireListeners();
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
    this.fireListeners();
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
  }
  /**
   * Gets the current redo stack size.
   * @returns Number of undoable actions in redo stack.
   */
  getRedoStackSize(): number {
    return this.redoStack.length;
  }

  public subscribe(listener: ActionManagerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    }
  }

  private fireListeners() {
    this.listeners.forEach((listener) => {
      listener(this.canUndo(), this.canRedo(), this.getUndoStackSize(), this.getRedoStackSize()); ß
    });
  }
}

let undoManager: ActionManager | undefined;

export function getActionManager(): ActionManager {
  if (!undoManager) {
    undoManager = new ActionManager();
  }
  return undoManager;
}