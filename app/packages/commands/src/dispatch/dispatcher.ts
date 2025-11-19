/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { Command, CommandCtor, CommandHandler, CommandResult } from "../types";

/**
 * Type-safe command dispatcher with runtime single handler enforcement.
 *
 * Commands express intent and are handled by exactly one handler.
 * Unlike events (which broadcast to multiple listeners), commands
 * follow the command pattern where each command type has a single
 * registered handler.
 *
 * @example
 * ```typescript
 * const bus = new CommandDispatcher();
 *
 * // Register handler
 * bus.register(CreateUser, async (cmd) => {
 *   const id = await userRepo.create({ email: cmd.email });
 *   return { id };
 * });
 *
 * // Execute command
 * const result = await bus.execute(new CreateUser("user@example.com"));
 * // result: { id: string }
 * ```
 */
export class CommandDispatcher {
  private handlers = new Map<CommandCtor<any>, CommandHandler<any>>();

  /**
   * Registers a handler for a command type.
   *
   * @template C - Command type
   * @param type - Command constructor
   * @param handler - Handler function that processes the command
   * @throws Error if a handler is already registered for this command type
   *
   * @example
   * ```typescript
   * bus.register(CreateUser, async (cmd) => {
   *   const id = await userRepo.create({ email: cmd.email });
   *   return { id };
   * });
   * ```
   */
  register<C extends Command<any>>(
    type: CommandCtor<C>,
    handler: CommandHandler<C>
  ): void {
    if (this.handlers.has(type)) {
      throw new Error(`Handler already registered for ${type.name}`);
    }
    this.handlers.set(type, handler);
  }

  /**
   * Unregisters a handler for a command type.
   *
   * @template C - Command type
   * @param type - Command constructor
   *
   * @example
   * ```typescript
   * bus.unregister(CreateUser);
   * ```
   */
  unregister<C extends Command<any>>(type: CommandCtor<C>): void {
    this.handlers.delete(type);
  }

  /**
   * Executes a command by dispatching it to its registered handler.
   *
   * @template C - Command type
   * @param cmd - Command instance to execute
   * @returns Promise resolving to the command's result type
   * @throws Error if no handler is registered for the command type
   *
   * @example
   * ```typescript
   * const result = await bus.execute(new CreateUser("user@example.com"));
   * // result: { id: string }
   * ```
   */
  async execute<C extends Command<any>>(cmd: C): Promise<CommandResult<C>> {
    const handler = this.handlers.get(cmd.constructor as CommandCtor<any>);
    if (!handler) {
      throw new Error(`No handler registered for ${cmd.constructor.name}`);
    }
    return handler(cmd) as Promise<CommandResult<C>>;
  }
}
