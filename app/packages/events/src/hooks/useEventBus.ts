import { useMemo } from "react";
import { DEFAULT_CHANNEL_ID, EventDispatcher, getEventBus } from "../dispatch";
import { EventGroup } from "../types";

/**
 * Hook that provides access to the default event bus.
 * The dispatcher is shared across all components.
 *
 * @template T - EventGroup type defining event types and payloads
 * @returns Event dispatcher with on, off, and dispatch methods
 */
export const useEventBus = <T extends EventGroup>(
  channelId = DEFAULT_CHANNEL_ID
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
