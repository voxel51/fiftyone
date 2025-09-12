/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

/**
 * Command interface for undo/redo operations.
 */
export interface Command {
  /** Unique identifier for the command. */
  readonly id: string;
  /** Human-readable description of the command. */
  readonly description: string;

  /**
   * Executes the command.
   */
  execute(): void;

  /**
   * Undoes the command.
   */
  undo(): void;
}
