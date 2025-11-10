import { useMemo } from "react";
import { EventDispatcher } from "../dispatch";
import { EventGroup } from "../types";

/**
 * Static registry of event dispatchers by channel ID.
 */
const dispatcherRegistry = new Map<string, EventDispatcher<any>>();

/**
 * Gets or creates an event dispatcher for the given channel ID.
 */
function getDispatcher<T extends EventGroup>(
  channelId: string
): EventDispatcher<T> {
  if (!dispatcherRegistry.has(channelId)) {
    dispatcherRegistry.set(channelId, new EventDispatcher<T>());
  }
  return dispatcherRegistry.get(channelId) as EventDispatcher<T>;
}

/**
 * Direct access to event dispatcher for JavaScript interop (non-React usage only).
 *
 * **⚠️ For React components, use {@link useEventBus} hook instead.**
 * This function is intended for accessing the event bus from outside React components,
 * such as in vanilla JavaScript code, utility functions, or event handlers that aren't
 * part of the React component tree.
 *
 * @template T - EventGroup type defining event types and payloads
 * @param channelId - Channel identifier (defaults to "default")
 * @returns Event dispatcher with on, off, and dispatch methods
 *
 * @example
 * ```typescript
 * // ✅ Good: Non-React usage
 * const bus = getEventBus<MyEventGroup>("my-channel");
 * bus.on("my:event", (data) => console.log(data));
 * bus.dispatch("my:event", { value: 42 });
 *
 * // ❌ Bad: In React components, use useEventBus instead
 * function MyComponent() {
 *   const bus = getEventBus<MyEventGroup>(); // Don't do this!
 *   // Use: const bus = useEventBus<MyEventGroup>();
 * }
 * ```
 */
export function getEventBus<T extends EventGroup>(
  channelId = "default"
): EventDispatcher<T> {
  return getDispatcher<T>(channelId);
}

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
    const dispatcher = getDispatcher<T>(channelId);
    // Return bound methods to allow destructuring while maintaining 'this' context
    // This also gives us flexibility to e.g. inject a global observer here
    return {
      on: dispatcher.on.bind(dispatcher),
      off: dispatcher.off.bind(dispatcher),
      dispatch: dispatcher.dispatch.bind(dispatcher),
    } as EventDispatcher<T>;
  }, [channelId]);
};
