/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useMemo } from "react";
import { CommandDispatcher, getCommandBus } from "../dispatch";

/**
 * Hook that provides access to the default command bus.
 * The dispatcher is shared across all components.
 *
 * @returns Command dispatcher with register and execute methods
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const bus = useCommandBus();
 *
 *   useEffect(() => {
 *     // Register handlers (typically done in composition root)
 *     bus.register(CreateUser, async (cmd) => {
 *       const id = await userRepo.create({ email: cmd.email });
 *       return { id };
 *     });
 *   }, [bus]);
 *
 *   const handleClick = async () => {
 *     const result = await bus.execute(new CreateUser("user@example.com"));
 *     console.log(result.id);
 *   };
 *
 *   return <button onClick={handleClick}>Create User</button>;
 * }
 * ```
 */
export const useCommandBus = () => {
  return useMemo(() => {
    const dispatcher = getCommandBus();
    // Return bound methods to allow destructuring while maintaining 'this' context
    // This also gives us flexibility to e.g. inject a global observer here
    return {
      execute: dispatcher.execute.bind(dispatcher),
    } as Pick<CommandDispatcher, "execute">;
  }, []);
};
