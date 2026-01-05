/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Base Command abstract class.
 *
 * Commands express intent and carry data needed for execution.
 * The result type is inferred from the generic parameter via CommandResult<C>.
 *
 * Commands should extend this class rather than implementing it, so they
 * don't need to redeclare the `__result` property.
 *
 * @template Result - The type returned by the command handler
 *
 * @example
 * ```typescript
 * export class CreateUser extends Command<{ id: string }> {
 *   constructor(public readonly email: string) {
 *     super();
 *   }
 * }
 * ```
 */
export abstract class Command<Result = unknown> {
  /** @internal Type marker for TypeScript's structural type system - never accessed at runtime.
   * Example: enforces type safety for the .execute() method of the bus.
   */
  protected readonly __result?: Result;
}

/**
 * Extracts the result type from a Command type.
 *
 * @template C - Command type
 * @returns The result type of the command
 *
 * @example
 * ```typescript
 * type Result = CommandResult<CreateUser>; // { id: string }
 * ```
 */
export type CommandResult<C extends Command<any>> = C extends Command<infer R>
  ? R
  : never;

/**
 * Constructor type for command classes.
 *
 * @template C - Command type
 */
export type CommandCtor<C extends Command<any>> = new (...args: any[]) => C;

/**
 * Handler function that processes a command and returns a result.
 *
 * @template C - Command type
 * @param cmd - Command instance to handle
 * @returns Promise resolving to the command's result type
 *
 * @example
 * ```typescript
 * const handler: CommandHandler<CreateUser> = async (cmd) => {
 *   const id = await userRepo.create({ email: cmd.email });
 *   return { id }; // Type: { id: string }
 * };
 * ```
 */
export type CommandHandler<C extends Command<any>> = (
  cmd: C
) => Promise<CommandResult<C>>;
