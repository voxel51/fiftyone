/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Command } from "./Command";

/**
 * Manages undo/redo operations using the Command Pattern.
 *
 * This implementation follows the Command design pattern where each user action
 * is encapsulated as a Command object that implements both execute() and undo()
 * methods. The UndoRedoManager maintains two stacks:
 *
 * - undoStack: Contains executed commands that can be undone
 * - redoStack: Contains undone commands that can be redone
 *
 * When a new command is executed:
 * 1. The command is pushed onto the undoStack
 * 2. The redoStack is cleared (since a new action invalidates the redo history)
 *
 * When undo is called:
 * 1. The last command is popped from undoStack
 * 2. The command's undo() method is called
 * 3. The command is pushed onto redoStack
 *
 * When redo is called:
 * 1. The last command is popped from redoStack
 * 2. The command's execute() method is called
 * 3. The command is pushed onto undoStack
 */
export class UndoRedoManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxStackSize = 100;

  /**
   * Pushes a command onto the undo stack.
   * @param command - The command to push.
   */
  push(command: Command): void {
    this.undoStack.push(command);
    this.redoStack = []; // Clear redo stack when new command is pushed

    // Limit stack size
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }
  }

  /**
   * Undoes the last command.
   * @returns The undone command, or undefined if no commands to undo.
   */
  undo(): Command | undefined {
    const command = this.undoStack.pop();
    if (command) {
      command.undo();
      this.redoStack.push(command);
      return command;
    }
    return undefined;
  }

  /**
   * Redoes the last undone command.
   * @returns The redone command, or undefined if no commands to redo.
   */
  redo(): Command | undefined {
    const command = this.redoStack.pop();
    if (command) {
      command.execute();
      this.undoStack.push(command);
      return command;
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
    // see if any items have "destroy" method, if so, call it
    for (const command of this.undoStack) {
      if (command.hasOwnProperty("destroy")) {
        command["destroy"]();
      }
    }

    for (const command of this.redoStack) {
      if (command.hasOwnProperty("destroy")) {
        command["destroy"]();
      }
    }

    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Gets the current undo stack size.
   * @returns Number of commands in undo stack.
   */
  getUndoStackSize(): number {
    return this.undoStack.length;
  }

  /**
   * Gets the current redo stack size.
   * @returns Number of commands in redo stack.
   */
  getRedoStackSize(): number {
    return this.redoStack.length;
  }
}
