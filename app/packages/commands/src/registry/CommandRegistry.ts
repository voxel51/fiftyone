/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { ActionManager, Undoable } from "../actions";
import { Command, CommandFunction } from "../types";
import { isUndoable } from "../utils";

/**
 * Manages a map of registered commands.
 * This central command map allows for
 * components to easily consume execution
 * paths registered by parents and peers.
 */
export class CommandRegistry {
  private commands = new Map<string, Command>();
  private listeners = new Set<() => void>();

  constructor(private readonly actionManager: ActionManager) {}
  /**
   *
   * @param id The command id.  Use the "fo." prefix for our commands.  Plugins may register them as well.
   * @param execute The lambda to call on execution
   * @param label A short name like Save, Delete, etc
   * @param description A longer description such as "Deletes the selected annotation"
   * @param enablement A function to determine if the command is enabled.  It is invoked when
   * registering a command and can be refresh with the @link updateEnabled function.
   * @returns A command object that can be used locally to execute, enable etc.
   */
  public registerCommand(
    id: string,
    execute: CommandFunction,
    enablement: () => boolean,
    label?: string,
    description?: string
  ): Command {
    if (this.getCommand(id)) {
      throw new Error(`The command id ${id} is already registered`);
    }
    const cmd = new Command(id, execute, enablement, label, description);
    this.commands.set(id, cmd);
    this.fireListeners();
    return cmd;
  }

  /**
   * Removes a command from the registry.
   * @param id The command id
   */
  public unregisterCommand(id: string): void {
    if (this.commands.delete(id)) {
      this.fireListeners();
    }
  }

  /**
   * Executes a registered command
   * @param id The command id
   * @returns true if the command was registered and enabled and executed.
   */
  public async executeCommand(id: string): Promise<boolean> {
    const command = this.getCommand(id);
    if (command && command.isEnabled()) {
      const result = await command.execute();
      if (result && isUndoable(result)) {
        //enable undo/redo
        this.actionManager.push(result as Undoable);
      }
      return true;
    }
    return false;
  }

  private fireListeners() {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
  /**
   * Retrieves a previously registered command
   * @param id The command id
   * @returns The command object or undefined if not found.
   */
  public getCommand(id: string): Command | undefined {
    return this.commands.get(id);
  }
  /**
   * Register a listener to changes in the command registry
   * @param listener a callback
   */
  public addListener(listener: () => void) {
    this.listeners.add(listener);
  }

  /**
   * Unregister a previously registered listener
   * @param listener a callback
   */
  public removeListener(listener: () => void) {
    this.listeners.delete(listener);
  }
}
