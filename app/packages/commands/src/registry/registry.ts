/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Command } from "../types";

/**
 * Manages a map of registered commands.
 * This central command map allows for 
 * components to easily consume execution 
 * paths registered by parents and peers.
 */
export class CommandRegistry {
  private commands = new Map<string, Command>();
  /**
   * 
   * @param id The command id.  Use the "fo." prefix for our commands.  Plugins may register them as well.
   * @param execute The lambda to call on execution
   * @param undo If provided the command will automatically support undo.  This function will be called to 
   * perform the undo.
   * @param label A short name like Save, Delete, etc
   * @param description A longer description such as "Deletes the selected annotation"
   * @param enablement A function to determine if the command is inabled.  It is invoked when 
   * registering a command and can be refresh with the @link updateEnabled function.
   * @returns A command object that can be used locally to execute, enable etc.
   */
  public async registerCommand(
    id: string,
    execute: () => Promise<void>,
    undo?: () => Promise<void>,
    label?: string,
    description?: string,
    enablement?: () => boolean
  ): Promise<Command> {
    if (this.getCommand(id)) {
      throw new Error(`The command id ${id} is already registered`);
    }
    const cmd = new Command(id, execute, enablement, undo, label, description);
    this.commands.set(id, cmd);
    return cmd;
  }

  /**
   * Removes a commmand from the registry.
   * @param id The command id
   */
  public unregisterCommand(id: string): void {
    this.commands.delete(id);
  }

  /**
   * Executes a registered command
   * @param id The command id
   * @returns true if the command was registered and enabled and executed.
   */
  public async executeCommand(id: string): Promise<boolean> {
    const command = this.getCommand(id);
    if (command && command.enabled) {
      await command.execute();
      return true;
    }
    return false;
  }

  /**
   * Retrieves a previously registered command
   * @param id The command id
   * @returns The command object or undefined if not found.
   */
  public getCommand(id: string): Command | undefined {
    return this.commands.get(id);
  }
}
//global
const commandRegistry = new CommandRegistry();

export function getCommandRegistry(): CommandRegistry {
  return commandRegistry;
}
