import { EventGroup } from "../types";
import { useEventState } from "./useEventState";

/**
 * Factory function that creates a type-safe synchronized event state hook.
 * Similar to `createUseEventHandler`, but for synchronized state derivation instead of side effects.
 *
 * **When to use this vs createUseEventHandler:**
 * - Use `createUseSynchronizedEventState` when multiple components need to **read and display**
 *   the same event payload in their render. This prevents tearing (visual inconsistencies)
 *   during concurrent React rendering by ensuring all components see the same synchronized state.
 * - Use `createUseEventHandler` when components only need to **react** to events
 *   with side effects (logging, API calls, navigation, etc.)
 *
 * **Key differences:**
 * - `createUseSynchronizedEventState`: Returns a hook that reads the latest event payload synchronously
 *   during render. All components using the same event will see the same synchronized value,
 *   preventing tearing in concurrent React rendering.
 * - `createUseEventHandler`: Returns a hook that registers a callback for side effects.
 *   Components don't read state from it.
 *
 * **Important:** Event payloads must be plain data (serializable). Functions, classes,
 * and other non-serializable values are not allowed. See {@link PlainData} for details.
 *
 * @template T - EventGroup type defining event types and payloads (must use PlainData)
 * @returns A hook function that reads the latest synchronized event state
 *
 * @example
 * ```typescript
 * type CounterEventGroup = {
 *   "counter:updated": { count: number };
 *   "counter:reset": undefined;
 * };
 *
 * const useCounterState = createUseSynchronizedEventState<CounterEventGroup>();
 *
 * function CounterDisplay() {
 *   // Read latest count - safe from tearing, synchronized across all components
 *   const latestEvent = useCounterState("counter:updated");
 *   const count = latestEvent?.count ?? 0;
 *
 *   return <div>Count: {count}</div>;
 * }
 *
 * function AnotherCounterDisplay() {
 *   // This component will always see the same count as CounterDisplay
 *   // because useSyncExternalStore ensures synchronization
 *   const latestEvent = useCounterState("counter:updated");
 *   const count = latestEvent?.count ?? 0;
 *
 *   return <div>Also showing: {count}</div>;
 * }
 * ```
 */
export function createUseSynchronizedEventState<T extends EventGroup>() {
  return function useEventStateHook<K extends keyof T>(
    event: K
  ): T[K] | undefined {
    return useEventState<T, K>(event);
  };
}

/**
 * Factory function that creates a type-safe synchronized event state hook with default values.
 * Similar to `createUseSynchronizedEventState`, but allows specifying a default value per event type.
 *
 * @template T - EventGroup type defining event types and payloads
 * @returns A hook function that reads the latest synchronized event state with defaults
 *
 * @example
 * ```typescript
 * const useCounterState = createUseSynchronizedEventStateWithDefaults<CounterEventGroup>({
 *   "counter:updated": { count: 0 },
 * });
 *
 * function CounterDisplay() {
 *   // Always returns a value (never undefined), synchronized across all components
 *   const latestEvent = useCounterState("counter:updated");
 *   return <div>Count: {latestEvent.count}</div>;
 * }
 * ```
 */
export function createUseSynchronizedEventStateWithDefaults<
  T extends EventGroup
>(defaults: { [K in keyof T]?: T[K] }) {
  return function useEventStateHook<K extends keyof T>(
    event: K,
    defaultValue?: T[K]
  ): T[K] {
    const defaultVal = defaultValue ?? defaults[event];
    if (defaultVal === undefined) {
      // No default provided - return undefined (cast to T[K] for type compatibility)
      return useEventState<T, K>(event) as T[K];
    }
    return useEventState<T, K>(event, defaultVal);
  };
}
