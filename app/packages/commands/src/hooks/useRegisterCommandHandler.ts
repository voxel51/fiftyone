/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useEffect, useRef } from "react";
import { getCommandBus } from "../dispatch";
import { Command, CommandCtor, CommandHandler } from "../types";

/**
 * Hook that registers a command handler in a useEffect.
 * The handler is registered on mount and remains registered for the component's lifetime.
 *
 * **Note:** The handler function should be stable (use `useCallback` if it depends on props/state).
 * If the handler changes, it will attempt to re-register, which will throw an error if
 * a handler is already registered for this command type.
 *
 * @template C - Command type
 * @param type - Command constructor
 * @param handler - Handler function that processes the command
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   useRegisterCommandHandler(CreateUser, useCallback(async (cmd) => {
 *     const id = await userRepo.create({ email: cmd.email });
 *     return { id };
 *   }, [userRepo]));
 *
 *   return <div>My Component</div>;
 * }
 * ```
 */
export const useRegisterCommandHandler = <C extends Command<any>>(
  type: CommandCtor<C>,
  handler: CommandHandler<C>
): void => {
  const registeredTypeRef = useRef<CommandCtor<any> | null>(null);

  useEffect(() => {
    const bus = getCommandBus();
    const previousType = registeredTypeRef.current;

    // Unregister previous handler if type changed
    if (previousType !== null && previousType !== type) {
      bus.unregister(previousType);
      registeredTypeRef.current = null;
    }

    // Register new handler if not already registered
    if (registeredTypeRef.current !== type) {
      try {
        bus.register(type, handler);
        registeredTypeRef.current = type;
      } catch (error) {
        console.error(`Failed to register handler for ${type.name}:`, error);
      }
    }

    return () => {
      if (registeredTypeRef.current === type) {
        bus.unregister(type);
        registeredTypeRef.current = null;
      }
    };
  }, [type, handler]);
};
