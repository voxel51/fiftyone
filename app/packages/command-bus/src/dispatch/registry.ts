/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { CommandDispatcher } from "./dispatcher";

export const DEFAULT_CHANNEL_ID = "default";

/**
 * Static registry of command dispatchers by channel ID.
 */
const dispatcherRegistry = new Map<string, CommandDispatcher>();

/**
 * Gets or creates a command dispatcher for the given channel ID.
 */
function getDispatcher(channelId: string): CommandDispatcher {
  if (!dispatcherRegistry.has(channelId)) {
    dispatcherRegistry.set(channelId, new CommandDispatcher());
  }
  return dispatcherRegistry.get(channelId) as CommandDispatcher;
}

/**
 * Direct access to command dispatcher for JavaScript interop (non-React usage only).
 *
 * **⚠️ For React components, use {@link useCommandBus} hook instead.**
 * This function is intended for accessing the command bus from outside React components,
 * such as in vanilla JavaScript code, utility functions, or event handlers that aren't
 * part of the React component tree.
 *
 * @returns Command dispatcher with register and execute methods
 *
 * @example
 * ```typescript
 * // ✅ Good: Non-React usage
 * const bus = getCommandBus();
 * bus.register(CreateUser, async (cmd) => {
 *   const id = await userRepo.create({ email: cmd.email });
 *   return { id };
 * });
 * const result = await bus.execute(new CreateUser("user@example.com"));
 *
 * // ❌ Bad: In React components, use useCommandBus instead
 * function MyComponent() {
 *   const bus = getCommandBus(); // Don't do this!
 *   // Use: const bus = useCommandBus();
 * }
 * ```
 */
export function getCommandBus(): CommandDispatcher {
  return getDispatcher(DEFAULT_CHANNEL_ID);
}

/**
 * Exports the registry for testing purposes.
 */
export const __test__ = {
  registry: dispatcherRegistry,
};
