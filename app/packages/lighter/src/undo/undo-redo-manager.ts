/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Command } from "../types";
import {
  LighterEventBus,
  UndoEvent,
  RedoEvent,
  UNDO_EVENT,
  REDO_EVENT,
} from "../core/events";

/**
 * Manager for undo/redo operations.
 */
export class UndoRedoManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxStackSize: number;
  private eventBus: LighterEventBus;
  private isExecuting: boolean = false;

  constructor(eventBus: LighterEventBus, maxStackSize = 100) {
    this.eventBus = eventBus;
    this.maxStackSize = maxStackSize;
    this.setupEventListeners();
  }

  /**
   * Executes a command and adds it to the undo stack.
   */
  executeCommand(command: Command): void {
    if (this.isExecuting) {
      return; // Prevent infinite loops during undo/redo
    }

    try {
      this.isExecuting = true;
      command.execute();

      // Add to undo stack
      this.undoStack.push(command);

      // Clear redo stack when new command is executed
      this.redoStack = [];

      // Maintain stack size limit
      if (this.undoStack.length > this.maxStackSize) {
        this.undoStack.shift();
      }
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Undoes the last command.
   */
  undo(): boolean {
    if (this.undoStack.length === 0 || this.isExecuting) {
      return false;
    }

    const command = this.undoStack.pop()!;

    try {
      this.isExecuting = true;
      command.undo();
      this.redoStack.push(command);

      // Maintain redo stack size
      if (this.redoStack.length > this.maxStackSize) {
        this.redoStack.shift();
      }

      return true;
    } catch (error) {
      // If undo fails, put the command back
      this.undoStack.push(command);
      console.error("Failed to undo command:", error);
      return false;
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Redoes the last undone command.
   */
  redo(): boolean {
    if (this.redoStack.length === 0 || this.isExecuting) {
      return false;
    }

    const command = this.redoStack.pop()!;

    try {
      this.isExecuting = true;
      command.execute();
      this.undoStack.push(command);

      // Maintain undo stack size
      if (this.undoStack.length > this.maxStackSize) {
        this.undoStack.shift();
      }

      return true;
    } catch (error) {
      // If redo fails, put the command back
      this.redoStack.push(command);
      console.error("Failed to redo command:", error);
      return false;
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Checks if undo is available.
   */
  canUndo(): boolean {
    return this.undoStack.length > 0 && !this.isExecuting;
  }

  /**
   * Checks if redo is available.
   */
  canRedo(): boolean {
    return this.redoStack.length > 0 && !this.isExecuting;
  }

  /**
   * Gets the description of the next command to undo.
   */
  getUndoDescription(): string | null {
    if (this.undoStack.length === 0) {
      return null;
    }
    return this.undoStack[this.undoStack.length - 1].description;
  }

  /**
   * Gets the description of the next command to redo.
   */
  getRedoDescription(): string | null {
    if (this.redoStack.length === 0) {
      return null;
    }
    return this.redoStack[this.redoStack.length - 1].description;
  }

  /**
   * Clears both undo and redo stacks.
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Gets the current state of the undo/redo stacks.
   */
  getState(): {
    undoCount: number;
    redoCount: number;
    canUndo: boolean;
    canRedo: boolean;
    undoDescription: string | null;
    redoDescription: string | null;
  } {
    return {
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoDescription: this.getUndoDescription(),
      redoDescription: this.getRedoDescription(),
    };
  }

  /**
   * Disposes of the manager and removes event listeners.
   */
  dispose(): void {
    this.eventBus.removeAllListeners();
    this.clear();
  }

  private setupEventListeners(): void {
    this.eventBus.on(UNDO_EVENT, () => {
      this.undo();
    });

    this.eventBus.on(REDO_EVENT, () => {
      this.redo();
    });
  }
}

/**
 * Base implementation of a command.
 */
export abstract class BaseCommand implements Command {
  abstract description: string;

  abstract execute(): void;
  abstract undo(): void;
}

/**
 * Command for adding an overlay.
 */
export class AddOverlayCommand extends BaseCommand {
  description: string;

  constructor(
    private overlayId: string,
    private addFunction: () => void,
    private removeFunction: () => void
  ) {
    super();
    this.description = `Add overlay ${overlayId}`;
  }

  execute(): void {
    this.addFunction();
  }

  undo(): void {
    this.removeFunction();
  }
}

/**
 * Command for removing an overlay.
 */
export class RemoveOverlayCommand extends BaseCommand {
  description: string;

  constructor(
    private overlayId: string,
    private removeFunction: () => void,
    private restoreFunction: () => void
  ) {
    super();
    this.description = `Remove overlay ${overlayId}`;
  }

  execute(): void {
    this.removeFunction();
  }

  undo(): void {
    this.restoreFunction();
  }
}

/**
 * Command for updating an overlay.
 */
export class UpdateOverlayCommand extends BaseCommand {
  description: string;

  constructor(
    private overlayId: string,
    private applyChanges: () => void,
    private revertChanges: () => void,
    private changeDescription: string
  ) {
    super();
    this.description = `Update overlay ${overlayId}: ${changeDescription}`;
  }

  execute(): void {
    this.applyChanges();
  }

  undo(): void {
    this.revertChanges();
  }
}

/**
 * Composite command that executes multiple commands as one.
 */
export class CompositeCommand extends BaseCommand {
  description: string;

  constructor(private commands: Command[], description: string) {
    super();
    this.description = description;
  }

  execute(): void {
    for (const command of this.commands) {
      command.execute();
    }
  }

  undo(): void {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }
}
