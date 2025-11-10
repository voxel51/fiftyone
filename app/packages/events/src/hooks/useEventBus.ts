import { useMemo } from "react";
import { EventDispatcher, getEventBus } from "../dispatch";
import { EventGroup } from "../types";

/**
 * Hook that provides access to an event bus for a specific channel.
 * The dispatcher is shared across all components using the same channel ID.
 *
 * @template T - EventGroup type defining event types and payloads
 * @param options - Configuration options
 * @param options.channelId - Channel identifier (defaults to "default")
 * @returns Event dispatcher with on, off, and dispatch methods
 */
export const useEventBus = <T extends EventGroup>(
  { channelId } = { channelId: "default" }
) => {
  return useMemo(() => {
    const dispatcher = getEventBus<T>(channelId);
    // Return bound methods to allow destructuring while maintaining 'this' context
    // This also gives us flexibility to e.g. inject a global observer here
    return {
      on: dispatcher.on.bind(dispatcher),
      off: dispatcher.off.bind(dispatcher),
      dispatch: dispatcher.dispatch.bind(dispatcher),
    } as EventDispatcher<T>;
  }, [channelId]);
};
