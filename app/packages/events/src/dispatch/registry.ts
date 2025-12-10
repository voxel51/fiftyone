import { EventDispatcher } from "../dispatch/dispatcher";
import { EventGroup } from "../types";

export const DEFAULT_CHANNEL_ID = "default";

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
 * @returns Event dispatcher with on, off, and dispatch methods
 *
 * @example
 * ```typescript
 * // ✅ Good: Non-React usage
 * const bus = getEventBus<MyEventGroup>();
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
  channelId = DEFAULT_CHANNEL_ID
): EventDispatcher<T> {
  return getDispatcher<T>(channelId);
}

/**
 * Clears all event handlers for a given channel and optionally removes it from the registry.
 *
 * This function should be called during cleanup (e.g., when destroying a scene) to ensure
 * all event handlers are properly removed, preventing memory leaks and stale handler invocations.
 *
 * @param channelId - The channel ID to clear. Defaults to the default channel.
 * @param removeFromRegistry - If true, removes the dispatcher from the registry entirely.
 *                             If false, only clears all handlers but keeps the dispatcher.
 *                             Defaults to true.
 *
 * @example
 * ```typescript
 * // Clear all handlers and remove from registry (typical cleanup)
 * clearChannel("my-scene-id");
 *
 * // Clear all handlers but keep the dispatcher for reuse
 * clearChannel("my-scene-id", false);
 * ```
 */
export function clearChannel(
  channelId = DEFAULT_CHANNEL_ID,
  removeFromRegistry = true
): void {
  const dispatcher = dispatcherRegistry.get(channelId);
  if (dispatcher) {
    dispatcher.clearAll();
    if (removeFromRegistry) {
      dispatcherRegistry.delete(channelId);
    }
  }
}

/**
 * Exports the registry for testing purposes.
 */
export const __test__ = {
  registry: dispatcherRegistry,
};
