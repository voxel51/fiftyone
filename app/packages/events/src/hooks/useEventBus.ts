import { useMemo } from "react";
import { EventDispatcher, getEventBus } from "../dispatch";
import { EventGroup } from "../types";

/**
 * Hook that provides access to the default event bus.
 * The dispatcher is shared across all components.
 *
 * **When to use this:**
 * - Use `useEventBus` when you need to dispatch events or manually manage subscriptions
 * - For subscribing to events with side effects, prefer `createUseEventHandler`
 * - For reading event state in render, use `useEventState` or `createUseSynchronizedEventState`
 *
 * @template T - EventGroup type defining event types and payloads
 * @returns Event dispatcher with on, off, and dispatch methods
 */
export const useEventBus = <T extends EventGroup>() => {
  return useMemo(() => {
    const dispatcher = getEventBus<T>();
    // Return bound methods to allow destructuring while maintaining 'this' context
    // This also gives us flexibility to e.g. inject a global observer here
    return {
      on: dispatcher.on.bind(dispatcher),
      off: dispatcher.off.bind(dispatcher),
      dispatch: dispatcher.dispatch.bind(dispatcher),
    } as EventDispatcher<T>;
  }, []);
};
