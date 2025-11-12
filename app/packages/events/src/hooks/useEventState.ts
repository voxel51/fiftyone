import { useSyncExternalStore } from "react";
import { getEventStateStore } from "../state/EventStateStore";
import { EventGroup } from "../types";

/**
 * Hook that reads the latest state from an event using useSyncExternalStore.
 * This prevents tearing in concurrent React rendering when multiple components
 * derive state from the same event.
 *
 * **When to use this vs useEventHandler:**
 * - Use `useEventState` when you need to **read and display** the latest event payload
 *   in your component's render (e.g., showing the current count, latest message, etc.)
 * - Use `useEventHandler` (or `createUseEventHandler`) when you only need to **react**
 *   to events with side effects (e.g., logging, API calls, navigation)
 *
 * **Key differences:**
 * - `useEventState`: Returns the latest event payload synchronously during render.
 *   Multiple components reading the same event will always see the same value,
 *   preventing visual inconsistencies (tearing). If no default is provided, returns undefined
 *   when no event has been dispatched yet.
 * - `useEventHandler`: Registers a callback that runs when events occur. Useful
 *   for side effects but doesn't provide synchronized state reading.
 *
 * **Important:** Event payloads must be plain data (serializable). Functions, classes,
 * and other non-serializable values are not allowed. See {@link PlainData} for details.
 *
 * @template T - EventGroup type defining event types and payloads (must use PlainData)
 * @template K - Specific event type key
 * @param event - The event type to track
 * @param defaultValue - Optional default value to return if no event has been dispatched yet.
 *   If not provided, returns undefined when no event has been dispatched.
 * @returns The latest payload for the event, or the default value (or undefined if no default)
 *
 * @example
 * ```typescript
 * type CounterEventGroup = {
 *   "counter:updated": { count: number };
 * };
 *
 * // Without default - returns undefined initially
 * function CounterDisplay() {
 *   const latestEvent = useEventState<CounterEventGroup, "counter:updated">(
 *     "counter:updated"
 *   );
 *   const count = latestEvent?.count ?? 0;
 *   return <div>Count: {count}</div>;
 * }
 *
 * // With default - always returns a value
 * function CounterDisplayWithDefault() {
 *   const latestEvent = useEventState<CounterEventGroup, "counter:updated">(
 *     "counter:updated",
 *     { count: 0 } // Default value
 *   );
 *   return <div>Count: {latestEvent.count}</div>;
 * }
 * ```
 */
export function useEventState<T extends EventGroup, K extends keyof T>(
  event: K,
  defaultValue?: T[K]
): T[K] | undefined {
  const store = getEventStateStore<T>();
  const subscription = store.createSubscription(event);

  return useSyncExternalStore(subscription.subscribe, () =>
    defaultValue === undefined
      ? subscription.getSnapshot()
      : subscription.getSnapshotWithDefault(defaultValue)
  );
}
