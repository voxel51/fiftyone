/**
 * Copyright 2017-2026, Voxel51, Inc.
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
  const registeredHandlerRef = useRef<CommandHandler<any> | null>(null);

  useEffect(() => {
    const bus = getCommandBus();
    const previousType = registeredTypeRef.current;
    const previousHandler = registeredHandlerRef.current;

    if (
      previousType !== null &&
      (previousType !== type || previousHandler !== handler)
    ) {
      bus.unregister(previousType);
      registeredTypeRef.current = null;
      registeredHandlerRef.current = null;
    }

    if (
      registeredTypeRef.current !== type ||
      registeredHandlerRef.current !== handler
    ) {
      try {
        bus.register(type, handler);
        registeredTypeRef.current = type;
        registeredHandlerRef.current = handler;
      } catch (error) {
        console.error(`Failed to register handler for ${type.name}:`, error);
      }
    }

    return () => {
      if (registeredTypeRef.current === type) {
        bus.unregister(type);
        registeredTypeRef.current = null;
        registeredHandlerRef.current = null;
      }
    };
  }, [type, handler]);
};
